import { env } from '../config/env.js';
import { PitchPage } from '../models/PitchPage.js';
import { Enrollment } from '../models/Enrollment.js';
import { Lead } from '../models/Lead.js';
import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { WebsiteAudit } from '../models/WebsiteAudit.js';
import { Message } from '../models/Message.js';
import { Mailbox } from '../models/Mailbox.js';
import { Approval } from '../models/Approval.js';
import { SequenceStep, Campaign } from '../models/Campaign.js';
import { Template } from '../models/Template.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { suppress } from './suppression.service.js';
import { draftEmail } from './drafting.service.js';
import { emitToWorkspace } from '../socket/index.js';

/**
 * A2 — steps that are due to be actioned now. n8n polls this, drafts each, and
 * posts the drafts back to /internal/approvals. Returns lightweight rows.
 */
export async function dueSteps({ workspaceId, limit = 50 }) {
  const now = new Date();
  const enrollments = await Enrollment.find({
    workspaceId,
    status: 'active',
    nextDueAt: { $ne: null, $lte: now },
  })
    .limit(limit)
    .lean();

  const rows = [];
  for (const enr of enrollments) {
    const step = await SequenceStep.findOne({
      workspaceId,
      campaignId: enr.campaignId,
      order: enr.currentStep,
    }).lean();
    if (!step) continue;
    // Skip if an approval already exists for this step (idempotent polling).
    const existing = await Approval.findOne({
      workspaceId,
      enrollmentId: enr._id,
      stepOrder: enr.currentStep,
    }).lean();
    if (existing) continue;
    rows.push({
      enrollmentId: enr._id,
      leadId: enr.leadId,
      campaignId: enr.campaignId,
      stepOrder: enr.currentStep,
      channel: step.channel,
      templateId: step.templateId,
    });
  }
  return rows;
}

/**
 * A3 — draft a step with Gemini (guardrailed) and create a pending approval,
 * atomically. Idempotent per (enrollment, step): returns the existing approval.
 * n8n calls this per due step; the admin/Telegram approves before any send.
 */
export async function draftStep({ workspaceId, enrollmentId, stepOrder, tone, actorId }) {
  const result = await withTransaction(async (session) => {
    const existing = await Approval.findOne({ workspaceId, enrollmentId, stepOrder }).session(session);
    if (existing) return { approvalId: existing._id, idempotent: true, status: existing.status };

    const enr = await Enrollment.findOne({ workspaceId, _id: enrollmentId }).session(session);
    if (!enr) return { drafted: false, reason: 'enrollment_missing' };

    const step = await SequenceStep.findOne({ workspaceId, campaignId: enr.campaignId, order: stepOrder }).session(session);
    const template = step ? await Template.findOne({ workspaceId, _id: step.templateId }).session(session) : null;

    const lead = await Lead.findOne({ workspaceId, _id: enr.leadId }).session(session);
    const org = lead?.organizationId
      ? await Organization.findOne({ workspaceId, _id: lead.organizationId }).session(session)
      : null;
    const audit = lead?.auditId ? await WebsiteAudit.findOne({ workspaceId, _id: lead.auditId }).session(session) : null;

    // Personal values are filled into {{placeholders}} after the AI step and
    // never sent to the model (data minimisation).
    const contact = enr.contactId ? await Contact.findOne({ workspaceId, _id: enr.contactId }).session(session) : null;
    const pitch = await PitchPage.findOne({ workspaceId, leadId: enr.leadId, deletedAt: null }).session(session);
    const firstName = String(contact?.name ?? '').trim().split(/\s+/)[0] || 'there';
    const pitchUrl = pitch ? `${env.WEB_ORIGIN.replace(/\/$/, '')}/pitch/${pitch.slug}?t=${pitch.token}` : null;

    const draft = await draftEmail({
      business: { name: org?.name, city: org?.city, category: org?.category, country: org?.country, domain: org?.domain },
      audit: audit ? { issues: audit.issues, mobileScore: audit.mobileScore } : {},
      template: template?.variants?.[0],
      tone,
      channel: step?.channel ?? 'email',
      vars: { firstName, pitchUrl },
    });

    const [approval] = await Approval.create(
      [
        {
          workspaceId,
          createdBy: actorId,
          enrollmentId,
          leadId: enr.leadId,
          stepOrder,
          channel: step?.channel ?? 'email',
          draft: { subject: draft.subject, body: draft.body, personalizationNotes: draft.personalizationNotes },
          status: 'pending',
        },
      ],
      { session, ordered: true },
    );

    await writeAudit(
      {
        workspaceId,
        actorId,
        actorType: 'n8n',
        action: 'approval.created',
        entity: 'approval',
        entityId: approval._id,
        meta: { enrollmentId, stepOrder, source: draft.source, guardrailIssues: draft.guardrailIssues },
      },
      session,
    );
    return { approvalId: approval._id, status: 'pending', source: draft.source, guardrailIssues: draft.guardrailIssues ?? [] };
  });
  // D31 — notify the admin queue of a new draft (after commit).
  if (result?.approvalId && !result.idempotent) {
    emitToWorkspace(workspaceId, 'approval:created', { approvalId: result.approvalId, enrollmentId, stepOrder });
  }
  return result;
}

// Minimal DSN/bounce detection from a raw inbound message.
const HARD_BOUNCE = /(550|551|553|554|5\.1\.1|user unknown|no such user|mailbox unavailable|does not exist)/i;

/**
 * A5 — handle a bounce (DSN). Mark the contact's email invalid, suppress it,
 * mark the outbound message bounced, and stop the enrollment — atomically.
 * Matched by providerMessageId or the X-Klyro-Msg header token.
 */
export async function handleBounce({ workspaceId, providerMessageId, headerToken, contactEmail, dsnText, actorId }) {
  return withTransaction(async (session) => {
    const query = { workspaceId, direction: 'outbound' };
    let message = null;
    if (providerMessageId) message = await Message.findOne({ ...query, providerMessageId }).session(session);
    if (!message && headerToken) message = await Message.findOne({ ...query, headerToken }).session(session);

    if (message) {
      if (message.status === 'bounced') return { handled: true, idempotent: true };
      message.status = 'bounced';
      message.error = (dsnText ?? '').slice(0, 500);
      await message.save({ session });
    }

    const hard = !dsnText || HARD_BOUNCE.test(dsnText);
    const email = (contactEmail ?? '').toLowerCase() || null;

    if (email && hard) {
      await Contact.updateOne({ workspaceId, email }, { $set: { emailStatus: 'invalid' } }, { session });
      await suppress({ workspaceId, type: 'email', value: email, reason: 'bounce', createdBy: actorId }, session);
    }

    // Stop the enrollment tied to the bounced message.
    if (message?.enrollmentId) {
      await Enrollment.updateOne(
        { workspaceId, _id: message.enrollmentId, status: 'active' },
        { $set: { status: 'bounced', nextDueAt: null } },
        { session },
      );
    }

    await writeAudit(
      {
        workspaceId,
        actorId,
        actorType: 'n8n',
        action: 'message.bounced',
        entity: 'message',
        entityId: message?._id,
        meta: { email, hard },
      },
      session,
    );
    return { handled: true, hard, matched: Boolean(message) };
  });
}

// Re-export so callers importing from one place stay tidy.
export { Mailbox, Campaign };
