import { Enrollment } from '../models/Enrollment.js';
import { Lead } from '../models/Lead.js';
import { Contact } from '../models/Contact.js';
import { SequenceStep } from '../models/Campaign.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { isSuppressed } from './suppression.service.js';
import { addBusinessDays } from '../utils/timezone.js';

/** Reasons a lead can't be enrolled. Returns null if eligible. */
export async function ineligibleReason({ workspaceId, campaignId, lead }, session) {
  if (!lead || lead.deletedAt) return 'lead_missing';
  if (lead.stage === 'disqualified') return 'disqualified';
  const contact = lead.primaryContactId
    ? await Contact.findOne({ workspaceId, _id: lead.primaryContactId }).session(session)
    : null;
  if (!contact?.email || contact.emailStatus === 'invalid') return 'no_valid_email';
  // UK: only email incorporated companies (PECR).
  const org = await lead.populate({ path: 'organizationId', options: { session } });
  const orgDoc = org.organizationId;
  if (orgDoc?.country === 'GB' && !['ltd', 'llp', 'plc'].includes(orgDoc.companyType)) {
    return 'uk_not_incorporated';
  }
  if (await isSuppressed({ workspaceId, email: contact.email, phone: contact.phone }, session)) {
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
