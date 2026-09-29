import { Enrollment } from '../models/Enrollment.js';
import { Message } from '../models/Message.js';
import { Lead } from '../models/Lead.js';
import { Deal } from '../models/Deal.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { suppress } from './suppression.service.js';
import { transition } from './transition.service.js';
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
        [deal] = await Deal.create(
          [
            {
              workspaceId,
              createdBy: actorId,
              title: `Lead ${enrollment.leadId}`,
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
      // Advance new → contacted → replied via the guarded state machine.
      while (canTransition('deal', deal.stage, 'contacted') || canTransition('deal', deal.stage, 'replied')) {
        const next = deal.stage === 'new' ? 'contacted' : 'replied';
        await transition(
          { doc: deal, entity: 'deal', to: next, statusField: 'stage', actorId, actorType: 'system' },
          session,
        );
        if (deal.stage === 'replied') break;
      }
      if (lead && lead.stage !== 'converted') {
        lead.stage = 'replied';
        await lead.save({ session });
      }
      dealId = deal._id;
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
