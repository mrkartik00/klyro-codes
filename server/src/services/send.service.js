import crypto from 'node:crypto';
import { Mailbox } from '../models/Mailbox.js';
import { Message } from '../models/Message.js';
import { Enrollment } from '../models/Enrollment.js';
import { Contact } from '../models/Contact.js';
import { Lead } from '../models/Lead.js';
import { Organization } from '../models/Organization.js';
import { PitchPage } from '../models/PitchPage.js';
import { Campaign, SequenceStep } from '../models/Campaign.js';
import { withTransaction } from '../utils/transaction.js';
import { isSuppressed } from './suppression.service.js';
import { isWithinSendWindow, addBusinessDays } from '../utils/timezone.js';
import { recordEvent } from './analytics.service.js';
import { ApiError } from '../utils/ApiError.js';
import { Approval } from '../models/Approval.js';
import { makeToken } from '../utils/publicToken.js';
import { env } from '../config/env.js';

/** Signed one-click unsubscribe URL for a recipient (RFC 8058 compatible). */
export function unsubscribeUrl(workspaceId, email) {
  const base = (env.PUBLIC_API_URL || 'https://api.klyro.codes/api/v1').replace(/\/$/, '');
  return `${base}/public/u/${makeToken({ k: 'u', w: String(workspaceId), e: String(email).toLowerCase() })}`;
}

/**
 * Steps ready to send: an approved draft exists, the enrollment is still
 * active on that step and due, and nothing has been sent for it yet.
 */
export async function readySends({ workspaceId, limit = 20 }) {
  const approvals = await Approval.find({ workspaceId, status: 'approved', channel: 'email' })
    .sort({ decidedAt: 1 })
    .limit(limit * 10)
    .lean();
  // With few mailboxes the daily cap is scarce: send the most relevant
  // (highest-scoring) leads first, oldest approval breaking ties.
  const scores = Object.fromEntries(
    (await Lead.find({ workspaceId, _id: { $in: approvals.map((a) => a.leadId).filter(Boolean) } }).select('score').lean()).map((l) => [
      String(l._id),
      l.score ?? 0,
    ]),
  );
  approvals.sort((a, b) => (scores[String(b.leadId)] ?? 0) - (scores[String(a.leadId)] ?? 0));
  const now = new Date();
  const out = [];
  for (const a of approvals) {
    if (out.length >= limit) break;
    const enr = await Enrollment.findOne({ workspaceId, _id: a.enrollmentId }).lean();
    if (!enr || enr.status !== 'active' || enr.currentStep !== a.stepOrder) continue;
    if (enr.nextDueAt && enr.nextDueAt > now) continue;
    const sent = await Message.exists({ workspaceId, enrollmentId: a.enrollmentId, stepOrder: a.stepOrder, direction: 'outbound' });
    if (sent) continue;
    out.push({ enrollmentId: String(a.enrollmentId), stepOrder: a.stepOrder });
  }
  return out;
}

const INCORPORATED = new Set(['ltd', 'llp', 'plc']);

/**
 * Atomically reserve a send slot on an available mailbox.
 *
 * A single findOneAndUpdate increments sentToday only if the mailbox is active
 * and under its daily cap — so concurrent claims can never exceed the cap (the
 * DB serialises the update). Send spacing/jitter is handled by n8n between
 * claims, not here, so bursts of claims are allowed up to the cap. Suppression
 * and an existing message for the same step are checked in the same
 * transaction to prevent double sends. Idempotent per (enrollment, step):
 * returns the existing message if already claimed.
 */
export async function claimSend({ workspaceId, enrollmentId, stepOrder }) {
  return withTransaction(async (session) => {
    const enrollment = await Enrollment.findOne({ workspaceId, _id: enrollmentId }).session(session);
    if (!enrollment) throw ApiError.notFound('Enrollment not found');
    if (enrollment.status !== 'active') {
      return { claimed: false, reason: `enrollment_${enrollment.status}` };
    }

    // Idempotency: same step already has a message → return it.
    const existing = await Message.findOne({
      workspaceId,
      enrollmentId,
      stepOrder,
      direction: 'outbound',
    }).session(session);
    if (existing) return { claimed: true, messageId: existing._id, idempotent: true };

    // Human-in-the-loop: a draft that exists must be approved before it can go out.
    const approval = await Approval.findOne({ workspaceId, enrollmentId, stepOrder }).session(session);
    if (approval && approval.status !== 'approved') {
      return { claimed: false, reason: `draft_${approval.status}` };
    }

    // Last line of defence: never send an email that links a pitch page which
    // has no content (or no longer exists). Prevents "empty proposal" links.
    const draftText = `${approval?.draft?.subject ?? ''} ${approval?.draft?.body ?? ''}`;
    const pitchLink = draftText.match(/https?:\/\/\S*\/pitch\/([^/?\s]+)\?t=([^\s&)]+)/i);
    if (pitchLink) {
      const page = await PitchPage.findOne({ workspaceId, slug: pitchLink[1], deletedAt: null }).session(session);
      const ok = page && page.token === pitchLink[2] && Array.isArray(page.sections) && page.sections.length > 0;
      if (!ok) return { claimed: false, reason: 'pitch_empty_or_missing' };
    }

    const contact = await Contact.findOne({ workspaceId, _id: enrollment.contactId }).session(session);
    if (!contact?.email) return { claimed: false, reason: 'no_email' };
    if (await isSuppressed({ workspaceId, email: contact.email, phone: contact.phone }, session)) {
      return { claimed: false, reason: 'suppressed' };
    }

    // Lead-derived checks: local send window + UK incorporated-only (PECR).
    const lead = await Lead.findOne({ workspaceId, _id: enrollment.leadId }).session(session);
    const tz = lead?.timezone || 'UTC';
    const campaign = await Campaign.findOne({ workspaceId, _id: enrollment.campaignId }).session(session);
    const window = campaign?.sendWindow ?? { startHour: 9, endHour: 17, businessDaysOnly: true };
    if (!isWithinSendWindow(new Date(), window, tz)) {
      return { claimed: false, reason: 'outside_send_window' };
    }
    if (lead?.organizationId) {
      const org = await Organization.findOne({ workspaceId, _id: lead.organizationId }).session(session);
      if (org?.country === 'GB' && !INCORPORATED.has(org.companyType)) {
        return { claimed: false, reason: 'uk_not_incorporated' };
      }
    }

    const mailbox = await Mailbox.findOneAndUpdate(
      {
        workspaceId,
        status: 'active',
        $expr: { $lt: ['$sentToday', '$dailyCap'] },
      },
      { $inc: { sentToday: 1 }, $set: { lastSentAt: new Date() } },
      { sort: { sentToday: 1 }, new: true, session },
    );
    if (!mailbox) return { claimed: false, reason: 'no_mailbox_available' };

    const headerToken = crypto.randomBytes(12).toString('hex');
    const [message] = await Message.create(
      [
        {
          workspaceId,
          enrollmentId,
          leadId: enrollment.leadId,
          contactId: enrollment.contactId,
          mailboxId: mailbox._id,
          stepOrder,
          direction: 'outbound',
          status: 'sending',
          headerToken,
          threadId: enrollment.threadId,
        },
      ],
      { session, ordered: true },
    );

    return {
      claimed: true,
      messageId: message._id,
      mailboxId: mailbox._id,
      mailboxAddress: mailbox.address,
      n8nBranchId: mailbox.n8nBranchId,
      headerToken,
      to: contact.email,
      threadId: enrollment.threadId,
      subject: approval?.draft?.subject ?? null,
      body: approval?.draft?.body ?? null,
      unsubscribeUrl: unsubscribeUrl(workspaceId, contact.email),
    };
  });
}

/**
 * Move an enrollment past `fromStep`: schedule the next step in the lead's
 * timezone (by its business-day delay) or complete the sequence. Used after an
 * email is sent and after a manual LinkedIn/X/Reddit task is marked done.
 */
export async function advanceEnrollment({ workspaceId, enrollment, fromStep }, session) {
  if (!enrollment || enrollment.status !== 'active' || enrollment.currentStep !== fromStep) return enrollment;
  enrollment.currentStep = fromStep + 1;
  const nextStep = await SequenceStep.findOne({ workspaceId, campaignId: enrollment.campaignId, order: enrollment.currentStep }).session(session);
  if (nextStep) {
    const lead = await Lead.findOne({ workspaceId, _id: enrollment.leadId }).session(session);
    enrollment.nextDueAt = addBusinessDays(new Date(), nextStep.delayDays, lead?.timezone || 'UTC');
  } else {
    enrollment.nextDueAt = null;
    enrollment.status = 'completed';
  }
  await enrollment.save({ session });
  return enrollment;
}

/** Record the outcome of a send. On success, advance the enrollment's step. */
export async function recordSendResult({
  workspaceId,
  messageId,
  ok,
  providerMessageId,
  threadId,
  error,
}) {
  return withTransaction(async (session) => {
    const message = await Message.findOne({ workspaceId, _id: messageId }).session(session);
    if (!message) throw ApiError.notFound('Message not found');
    if (message.status === 'sent') return { updated: false, idempotent: true };

    message.status = ok ? 'sent' : 'failed';
    message.providerMessageId = providerMessageId ?? message.providerMessageId;
    message.threadId = threadId ?? message.threadId;
    message.sentAt = ok ? new Date() : undefined;
    message.error = ok ? undefined : error;
    await message.save({ session });

    if (ok) {
      const enrollment = await Enrollment.findOne({ workspaceId, _id: message.enrollmentId }).session(
        session,
      );
      if (enrollment && enrollment.status === 'active') {
        enrollment.threadId ??= threadId ?? null;
        enrollment.lastMessageId = providerMessageId ?? enrollment.lastMessageId;
        // Advance to the next sequence step. If there is a next step, schedule
        // nextDueAt in the lead's timezone by that step's business-day delay;
        // otherwise the sequence is complete.
        await advanceEnrollment({ workspaceId, enrollment, fromStep: message.stepOrder }, session);
      }
      // Record a 'sent' analytics event in the same txn.
      await recordEvent(
        { workspaceId, type: 'sent', channel: 'email', mailboxId: message.mailboxId, leadId: message.leadId },
        session,
      );
      // On send failure we do NOT refund sentToday: the attempt still touched
      // the provider and counts toward reputation budget.
    }
    return { updated: true };
  });
}
