import { Enrollment } from '../models/Enrollment.js';
import { Lead } from '../models/Lead.js';
import { Contact } from '../models/Contact.js';
import { Organization } from '../models/Organization.js';
import { PitchPage } from '../models/PitchPage.js';
import { SequenceStep } from '../models/Campaign.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { isSuppressed } from './suppression.service.js';
import { addBusinessDays } from '../utils/timezone.js';
import crypto from 'node:crypto';

/** Reasons a lead can't be enrolled. Returns null if eligible. */
export async function ineligibleReason({ workspaceId, campaignId, lead }, session) {
  if (!lead || lead.deletedAt) return 'lead_missing';
  if (lead.stage === 'disqualified') return 'disqualified';
  const contact = lead.primaryContactId
    ? await Contact.findOne({ workspaceId, _id: lead.primaryContactId }).session(session)
    : null;
  // Email is only required when the sequence actually sends email; LinkedIn/X
  // steps are manual tasks and work from the lead's profile links.
  const needsEmail = await SequenceStep.exists({ workspaceId, campaignId, channel: 'email' }).session(session);
  if (needsEmail && (!contact?.email || contact.emailStatus === 'invalid')) return 'no_valid_email';
  // UK: only email incorporated companies (PECR).
  const org = await lead.populate({ path: 'organizationId', options: { session } });
  const orgDoc = org.organizationId;
  if (orgDoc?.country === 'GB' && !['ltd', 'llp', 'plc'].includes(orgDoc.companyType)) {
    return 'uk_not_incorporated';
  }
  if (contact?.email && (await isSuppressed({ workspaceId, email: contact.email, phone: contact.phone }, session))) {
    return 'suppressed';
  }
  const existing = await Enrollment.findOne({ workspaceId, campaignId, leadId: lead._id }).session(session);
  if (existing) return 'already_enrolled';
  return null;
}

/** Bulk-enroll leads into a campaign atomically; returns per-lead outcomes. */
export async function enrollLeads({ workspaceId, campaignId, leadIds, timezoneDefault = 'UTC', createdBy }) {
  return withTransaction(async (session) => {
    const firstStep = await SequenceStep.findOne({ workspaceId, campaignId, order: 1 }).session(session);
    if (!firstStep) throw new Error('Campaign has no first step');

    const outcomes = [];
    for (const leadId of leadIds) {
      const lead = await Lead.findOne({ workspaceId, _id: leadId }).session(session);
      const reason = await ineligibleReason({ workspaceId, campaignId, lead }, session);
      if (reason) {
        outcomes.push({ leadId, enrolled: false, reason });
        continue;
      }
      const tz = lead.timezone || timezoneDefault;
      const nextDueAt = addBusinessDays(new Date(), firstStep.delayDays, tz);
      const [enr] = await Enrollment.create(
        [
          {
            workspaceId,
            createdBy,
            campaignId,
            leadId,
            contactId: lead.primaryContactId,
            currentStep: 1,
            nextDueAt,
          },
        ],
        { session, ordered: true },
      );
      lead.stage = 'enrolled';
      await lead.save({ session });

      // F42 — create a pitch page for the lead at enrollment (idempotent).
      const existingPitch = await PitchPage.findOne({ workspaceId, leadId }).session(session);
      if (!existingPitch) {
        const org = lead.organizationId
          ? await Organization.findOne({ workspaceId, _id: lead.organizationId }).session(session)
          : null;
        const base = (org?.name ?? 'pitch').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        await PitchPage.create(
          [
            {
              workspaceId,
              createdBy,
              leadId,
              slug: `${base}-${crypto.randomBytes(3).toString('hex')}`,
              token: crypto.randomBytes(16).toString('hex'),
              businessName: org?.name,
              sections: [],
            },
          ],
          { session, ordered: true },
        );
      }
      outcomes.push({ leadId, enrolled: true, enrollmentId: enr._id, nextDueAt });
    }

    await writeAudit(
      {
        workspaceId,
        actorId: createdBy,
        action: 'enrollment.bulk',
        entity: 'enrollment',
        meta: {
          campaignId,
          requested: leadIds.length,
          enrolled: outcomes.filter((o) => o.enrolled).length,
        },
      },
      session,
    );
    return outcomes;
  });
}

/**
 * Auto-enroll: fill the active email campaign with the best eligible leads that
 * are not yet enrolled. Picks highest-scoring enriched/new leads that have a
 * usable contact email, then defers all eligibility/PECR/suppression/dedupe
 * checks to enrollLeads (which skips anything ineligible). Capped per run so a
 * backlog drains gradually under the mailbox daily cap.
 *
 * Returns { campaignId, considered, enrolled, reasons } or { skipped } when
 * there is no active campaign / nothing to do.
 */
export async function autoEnrollWorkspace({ workspaceId, limit = 50, createdBy }) {
  const { Campaign } = await import('../models/Campaign.js');
  const campaign = await Campaign.findOne({ workspaceId, status: 'active', channel: 'email', deletedAt: null })
    .sort({ createdAt: 1 })
    .lean();
  if (!campaign) return { skipped: true, reason: 'no_active_email_campaign' };

  const enrolledLeadIds = await Enrollment.distinct('leadId', { workspaceId, campaignId: campaign._id });

  // Highest-scoring leads with a usable email that aren't already enrolled.
  const candidates = await Lead.aggregate([
    {
      $match: {
        workspaceId,
        deletedAt: null,
        stage: { $in: ['new', 'enriched'] },
        primaryContactId: { $ne: null },
        _id: { $nin: enrolledLeadIds },
      },
    },
    { $lookup: { from: 'contacts', localField: 'primaryContactId', foreignField: '_id', as: 'c' } },
    { $unwind: '$c' },
    { $match: { 'c.email': { $ne: null }, 'c.emailStatus': { $ne: 'invalid' } } },
    { $sort: { score: -1, createdAt: 1 } },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);

  const leadIds = candidates.map((c) => c._id);
  if (!leadIds.length) return { campaignId: campaign._id, considered: 0, enrolled: 0, reasons: {} };

  const outcomes = await enrollLeads({ workspaceId, campaignId: campaign._id, leadIds, createdBy: createdBy ?? campaign.createdBy });
  const reasons = {};
  for (const o of outcomes) if (!o.enrolled) reasons[o.reason] = (reasons[o.reason] || 0) + 1;
  return { campaignId: campaign._id, considered: leadIds.length, enrolled: outcomes.filter((o) => o.enrolled).length, reasons };
}
