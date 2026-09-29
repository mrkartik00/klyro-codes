import crypto from 'node:crypto';
import { Quotation } from '../models/Quotation.js';
import { Deal } from '../models/Deal.js';
import { Project, Milestone } from '../models/Project.js';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { assertTransition } from '../utils/stateMachine.js';
import { ApiError } from '../utils/ApiError.js';

const invoiceNumber = () => `KLY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex')}`;

/**
 * Accept a quotation: in ONE transaction mark it accepted, advance the deal to
 * 'won', create the project + milestones (one per line item), and issue the
 * advance invoice (first milestone). Fully atomic — the plan's core ACID flow.
 */
export async function acceptQuotation({ workspaceId, quotationId, clientUserId, actorId }) {
  return withTransaction(async (session) => {
    const quote = await Quotation.findOne({ workspaceId, _id: quotationId }).session(session);
    if (!quote) throw ApiError.notFound('Quotation not found');
    assertTransition('quotation', quote.status, 'accepted');
    quote.status = 'accepted';
    await quote.save({ session });

    const deal = await Deal.findOne({ workspaceId, _id: quote.dealId }).session(session);
    if (deal && deal.stage !== 'won') {
      // deal may be at quote or earlier; walk to won through allowed steps
      if (deal.stage === 'replied' || deal.stage === 'call') deal.stage = 'quote';
      assertTransition('deal', deal.stage, 'won');
      deal.stage = 'won';
      deal.value = { amountMinor: quote.totalMinor, currency: quote.currency };
      await deal.save({ session });
    }

    const [project] = await Project.create(
      [{ workspaceId, createdBy: actorId, dealId: quote.dealId, quotationId: quote._id, clientUserId, title: deal?.title ?? 'Project', status: 'active' }],
      { session, ordered: true },
    );

    const milestones = [];
    let order = 0;
    for (const item of quote.items) {
      const [m] = await Milestone.create(
        [{ workspaceId, createdBy: actorId, projectId: project._id, title: item.description, order: order++, amountMinor: item.unitAmountMinor * (item.quantity ?? 1), currency: quote.currency, status: order === 1 ? 'in_progress' : 'pending' }],
        { session, ordered: true },
      );
      milestones.push(m);
    }

    // Advance invoice = first milestone (or 30% of total if single milestone).
    const first = milestones[0];
    const advanceMinor = first ? first.amountMinor : Math.round(quote.totalMinor * 0.3);
    const [invoice] = await Invoice.create(
      [{ workspaceId, createdBy: actorId, dealId: quote.dealId, projectId: project._id, milestoneId: first?._id, number: invoiceNumber(), currency: quote.currency, amountMinor: advanceMinor, status: 'draft' }],
      { session, ordered: true },
    );

    await writeAudit(
      { workspaceId, actorId, action: 'quotation.accepted', entity: 'quotation', entityId: quote._id, meta: { projectId: project._id, invoiceId: invoice._id } },
      session,
    );
    return { projectId: project._id, invoiceId: invoice._id, milestoneCount: milestones.length };
  });
}

/**
 * Record a payment against an invoice atomically and advance the invoice
 * status. Idempotent on gatewayPaymentId (unique index + pre-check).
 */
export async function recordPayment({ workspaceId, invoiceId, amountMinor, currency, method, gatewayPaymentId, proofUrl, actorId }) {
  return withTransaction(async (session) => {
    if (gatewayPaymentId) {
      const dup = await Payment.findOne({ workspaceId, gatewayPaymentId }).session(session);
      if (dup) return { recorded: true, idempotent: true };
    }
    const invoice = await Invoice.findOne({ workspaceId, _id: invoiceId }).session(session);
    if (!invoice) throw ApiError.notFound('Invoice not found');

    await Payment.create(
      [{ workspaceId, createdBy: actorId, invoiceId, amountMinor, currency: currency ?? invoice.currency, method: method ?? 'razorpay', gatewayPaymentId, status: 'captured', proofUrl }],
      { session, ordered: true },
    );

    invoice.paidMinor += amountMinor;
    const to = invoice.paidMinor >= invoice.amountMinor ? 'paid' : 'partially_paid';
    // draft→sent may not have happened for gateway flows; allow sent→... only.
    if (invoice.status === 'draft') invoice.status = 'sent';
    assertTransition('invoice', invoice.status, to);
    invoice.status = to;
    await invoice.save({ session });

    await writeAudit(
      { workspaceId, actorId, actorType: gatewayPaymentId ? 'system' : 'user', action: 'payment.recorded', entity: 'invoice', entityId: invoice._id, meta: { amountMinor, to } },
      session,
    );
    return { recorded: true, invoiceStatus: to };
  });
}
