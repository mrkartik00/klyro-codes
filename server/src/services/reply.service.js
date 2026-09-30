import { Enrollment } from '../models/Enrollment.js';
import { Message } from '../models/Message.js';
import { Lead } from '../models/Lead.js';
import { Deal } from '../models/Deal.js';
import { Contact } from '../models/Contact.js';
import { Organization } from '../models/Organization.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { suppress } from './suppression.service.js';
import { transition } from './transition.service.js';
import { recordEvent } from './analytics.service.js';
import { canTransition } from '../utils/stateMachine.js';

// How each reply class affects the pipeline.
const POSITIVE = new Set(['interested', 'question']);
const STOP = new Set(['interested', 'question', 'objection', 'not_interested', 'referral', 'unsubscribe']);

/**
 * Handle an inbound reply atomically:
 *  - record the inbound message
 *  - stop the enrollment (if the class warrants)
 *  - unsubscribe → add to suppression list
 *  - positive → create/advance a deal to 'replied'
 * All in one transaction, so the CRM never diverges from the mailbox.
 */
export async function handleReply({
  workspaceId,
  enrollmentId,
  contactEmail,
  replyClass,
  subject,
  body,
  providerMessageId,
  threadId,
  actorId,
}) {
  return withTransaction(async (session) => {
    const enrollment = await Enrollment.findOne({ workspaceId, _id: enrollmentId }).session(session);
    if (!enrollment) throw new Error('Enrollment not found');

    // Idempotency: same provider message already recorded.
    if (providerMessageId) {
      const dup = await Message.findOne({ workspaceId, providerMessageId }).session(session);
      if (dup) return { handled: true, idempotent: true };
    }

    await Message.create(
      [
        {
          workspaceId,
          enrollmentId,
          leadId: enrollment.leadId,
          contactId: enrollment.contactId,
          direction: 'inbound',
          channel: 'email',
          subject,
          body,
          status: 'received',
          providerMessageId,
          threadId: threadId ?? enrollment.threadId,
        },
      ],
      { session, ordered: true },
    );

    if (replyClass === 'unsubscribe' && contactEmail) {
      await suppress({ workspaceId, type: 'email', value: contactEmail, reason: 'unsubscribe' }, session);
    }

    if (STOP.has(replyClass) && enrollment.status === 'active') {
      enrollment.status = replyClass === 'unsubscribe' ? 'stopped' : 'replied';
      enrollment.nextDueAt = null;
      await enrollment.save({ session });
    }

    let dealId = null;
    if (POSITIVE.has(replyClass)) {
      const lead = await Lead.findOne({ workspaceId, _id: enrollment.leadId }).session(session);
      let deal = await Deal.findOne({ workspaceId, leadId: enrollment.leadId }).session(session);
      if (!deal) {
        // A28 — title the deal after the business, not the raw ObjectId.
        const org = lead?.organizationId
          ? await Organization.findOne({ workspaceId, _id: lead.organizationId }).session(session)
          : null;
        [deal] = await Deal.create(
          [
            {
              workspaceId,
              createdBy: actorId,
              title: org?.name || 'New deal',
              leadId: enrollment.leadId,
              contactId: enrollment.contactId,
              stage: 'new',
            },
          ],
          { session, ordered: true },
        );
      }
      // Reload to guarantee a fresh, fully-populated doc (safe across
      // transaction-body retries where an in-memory doc may be stale).
      deal = await Deal.findOne({ workspaceId, _id: deal._id }).session(session);
      // A reply moves an early deal to "replied"; never pull a deal backwards
      // (it may already be at call/quote because someone moved it by hand).
      if (['new', 'contacted'].includes(deal.stage)) {
        await transition(
          { doc: deal, entity: 'deal', to: 'replied', statusField: 'stage', actorId, actorType: 'system' },
          session,
        );
      }
      if (lead && lead.stage !== 'converted') {
        lead.stage = 'replied';
        await lead.save({ session });
      }
      dealId = deal._id;
    }

    // A11 — analytics: every reply, plus a positive signal for the funnel.
    await recordEvent({ workspaceId, type: 'replied', channel: 'email', leadId: enrollment.leadId }, session);
    if (POSITIVE.has(replyClass)) {
      await recordEvent({ workspaceId, type: 'positive', channel: 'email', leadId: enrollment.leadId }, session);
    }

    await writeAudit(
      {
        workspaceId,
        actorId,
        actorType: 'n8n',
        action: 'reply.handled',
        entity: 'enrollment',
        entityId: enrollment._id,
        meta: { replyClass, dealId },
      },
      session,
    );

    return { handled: true, replyClass, dealId, stopped: STOP.has(replyClass) };
  });
}

/**
 * A7 — unsubscribe a contact: suppress the email and stop ALL their active
 * enrollments across campaigns, atomically. Idempotent.
 */
export async function unsubscribeContact({ workspaceId, email }) {
  const norm = String(email).toLowerCase();
  return withTransaction(async (session) => {
    await suppress({ workspaceId, type: 'email', value: norm, reason: 'unsubscribe' }, session);
    const contacts = await Contact.find({ workspaceId, email: norm }).session(session);
    const contactIds = contacts.map((c) => c._id);
    if (contactIds.length) {
      await Enrollment.updateMany(
        { workspaceId, contactId: { $in: contactIds }, status: 'active' },
        { $set: { status: 'stopped', nextDueAt: null } },
        { session },
      );
    }
    await writeAudit(
      { workspaceId, action: 'contact.unsubscribe', entity: 'contact', meta: { email: norm, contacts: contactIds.length } },
      session,
    );
    return { unsubscribed: true, contacts: contactIds.length };
  });
}

/**
 * Find which enrollment an inbound email belongs to. Gmail gives us the thread
 * id (set on our outbound message when it was sent); fall back to the sender's
 * most recent enrollment. Returns null for unrelated mail.
 */
export async function resolveReplyEnrollment({ workspaceId, threadId, contactEmail }) {
  if (threadId) {
    const msg = await Message.findOne({ workspaceId, threadId, direction: 'outbound' }).sort({ _id: -1 }).lean();
    if (msg?.enrollmentId) return String(msg.enrollmentId);
    const enr = await Enrollment.findOne({ workspaceId, threadId }).lean();
    if (enr) return String(enr._id);
  }
  if (contactEmail) {
    const contact = await Contact.findOne({ workspaceId, email: String(contactEmail).toLowerCase() }).lean();
    if (contact) {
      // Any status: a reply after the last step (completed) still counts.
      const enr = await Enrollment.findOne({ workspaceId, contactId: contact._id })
        .sort({ _id: -1 })
        .lean();
      if (enr) return String(enr._id);
    }
  }
  return null;
}
