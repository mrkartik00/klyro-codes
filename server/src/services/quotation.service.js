import { Quotation } from '../models/Quotation.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { assertTransition } from '../utils/stateMachine.js';
import { ApiError } from '../utils/ApiError.js';

/** Compute a quote total in integer minor units: (sum items) − discount + tax. */
export function computeTotal({ items, discountPercent = 0, taxPercent = 0 }) {
  const subtotal = items.reduce((acc, it) => acc + it.unitAmountMinor * (it.quantity ?? 1), 0);
  const afterDiscount = Math.round(subtotal * (1 - discountPercent / 100));
  const withTax = Math.round(afterDiscount * (1 + taxPercent / 100));
  return withTax;
}

export async function createQuotation({ workspaceId, dealId, currency, items, discountPercent, taxPercent, validUntil, createdBy }) {
  if (!items?.length) throw ApiError.badRequest('Quotation needs at least one item');
  const totalMinor = computeTotal({ items, discountPercent, taxPercent });
  const [quote] = await Quotation.create(
    [{ workspaceId, createdBy, dealId, currency, items, discountPercent, taxPercent, totalMinor, validUntil }],
    { ordered: true },
  );
  return quote;
}

/** Move a quotation through its lifecycle, writing audit in the same txn. */
export async function setQuotationStatus({ workspaceId, quotationId, to, actorId }) {
  return withTransaction(async (session) => {
    const quote = await Quotation.findOne({ workspaceId, _id: quotationId }).session(session);
    if (!quote) throw ApiError.notFound('Quotation not found');
    assertTransition('quotation', quote.status, to);
    const from = quote.status;
    quote.status = to;
    await quote.save({ session });
    await writeAudit(
      {
        workspaceId,
        actorId,
        action: 'quotation.transition',
        entity: 'quotation',
        entityId: quote._id,
        before: { status: from },
        after: { status: to },
      },
      session,
    );
    return quote;
  });
}

/** Create a new version that supersedes an existing quote (atomic). */
export async function reviseQuotation({ workspaceId, quotationId, changes, actorId }) {
  return withTransaction(async (session) => {
    const prev = await Quotation.findOne({ workspaceId, _id: quotationId }).session(session);
    if (!prev) throw ApiError.notFound('Quotation not found');
    if (['sent', 'expired', 'rejected'].includes(prev.status)) {
      assertTransition('quotation', prev.status, 'superseded');
      prev.status = 'superseded';
      await prev.save({ session });
    }
    const items = changes.items ?? prev.items;
    const discountPercent = changes.discountPercent ?? prev.discountPercent;
    const taxPercent = changes.taxPercent ?? prev.taxPercent;
    const [next] = await Quotation.create(
      [
        {
          workspaceId,
          createdBy: actorId,
          dealId: prev.dealId,
          version: prev.version + 1,
          currency: changes.currency ?? prev.currency,
          items,
          discountPercent,
          taxPercent,
          totalMinor: computeTotal({ items, discountPercent, taxPercent }),
          supersedesId: prev._id,
        },
      ],
      { session, ordered: true },
    );
    await writeAudit(
      { workspaceId, actorId, action: 'quotation.revise', entity: 'quotation', entityId: next._id, meta: { from: prev._id } },
      session,
    );
    return next;
  });
}
