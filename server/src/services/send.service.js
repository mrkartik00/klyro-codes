import crypto from 'node:crypto';
import { Mailbox } from '../models/Mailbox.js';
import { Message } from '../models/Message.js';
import { Enrollment } from '../models/Enrollment.js';
import { Contact } from '../models/Contact.js';
import { withTransaction } from '../utils/transaction.js';
import { isSuppressed } from './suppression.service.js';
import { ApiError } from '../utils/ApiError.js';

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

    const contact = await Contact.findOne({ workspaceId, _id: enrollment.contactId }).session(session);
    if (!contact?.email) return { claimed: false, reason: 'no_email' };
    if (await isSuppressed({ workspaceId, email: contact.email, phone: contact.phone }, session)) {
      return { claimed: false, reason: 'suppressed' };
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
    };
  });
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
        await enrollment.save({ session });
      }
      // On send failure we do NOT refund sentToday: the attempt still touched
      // the provider and counts toward reputation budget.
    }
    return { updated: true };
  });
}
