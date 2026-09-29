import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { Deal } from '../models/Deal.js';
import { Setting } from '../models/Setting.js';
import { User } from '../models/User.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { assertTransition } from '../utils/stateMachine.js';
import { renderQuotationPdf, renderInvoicePdf } from './pdf.service.js';
import { sendTransactional } from '../integrations/brevo/index.js';
import { createOrder } from '../integrations/razorpay/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

async function businessProfile(workspaceId) {
  const rows = await Setting.find({ workspaceId, key: { $in: ['businessProfile', 'bankDetails'] } }).lean();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { business: map.businessProfile ?? { name: 'Klyro', email: 'noreply@klyro.codes' }, bankDetails: map.bankDetails };
}

async function recipientEmail(workspaceId, dealId) {
  const deal = await Deal.findOne({ workspaceId, _id: dealId }).lean();
  if (deal?.clientUserId) {
    const u = await User.findById(deal.clientUserId).lean();
    if (u?.email) return u.email;
  }
  return null;
}

/**
 * C20 — send a quotation to the client: render PDF, mark it sent (guarded),
 * email a view link via Brevo. Transactional on the status change + audit.
 */
export async function sendQuotation({ workspaceId, quotationId, actorId }) {
  const { business } = await businessProfile(workspaceId);
  const quote = await withTransaction(async (session) => {
    const q = await Quotation.findOne({ workspaceId, _id: quotationId }).session(session);
    if (!q) throw ApiError.notFound('Quotation not found');
    if (q.status === 'draft') {
      assertTransition('quotation', q.status, 'sent');
      q.status = 'sent';
      await q.save({ session });
    }
    await writeAudit(
      { workspaceId, actorId, action: 'quotation.sent', entity: 'quotation', entityId: q._id },
      session,
    );
    return q;
  });

  await renderQuotationPdf({ quotation: quote, business }).catch(() => ({}));
  const to = await recipientEmail(workspaceId, quote.dealId);
  if (to) {
    const link = `${env.PORTAL_ORIGIN}/quotes/${quote._id}`;
    await sendTransactional({
      to,
      subject: 'Your quotation from Klyro',
      htmlContent: `<p>Your quotation is ready. View and accept it here: <a href="${link}">${link}</a></p>`,
    }).catch(() => {});
  }
  return { sent: true, quotationId: quote._id, emailed: Boolean(to) };
}

/**
 * C21 — send an invoice: render PDF, create a Razorpay order (if configured),
 * mark it sent, email the client a pay/view link. Transactional on the writes.
 */
export async function sendInvoice({ workspaceId, invoiceId, actorId }) {
  const { business, bankDetails } = await businessProfile(workspaceId);

  const invoice = await withTransaction(async (session) => {
    const inv = await Invoice.findOne({ workspaceId, _id: invoiceId }).session(session);
    if (!inv) throw ApiError.notFound('Invoice not found');
    if (inv.status === 'draft') {
      assertTransition('invoice', inv.status, 'sent');
      inv.status = 'sent';
    }
    await inv.save({ session });
    await writeAudit(
      { workspaceId, actorId, action: 'invoice.sent', entity: 'invoice', entityId: inv._id },
      session,
    );
    return inv;
  });

  // Razorpay order (outside the txn; external call). Store the order id.
  let order = null;
  try {
    order = await createOrder({ amountMinor: invoice.amountMinor, currency: invoice.currency, receipt: invoice.number });
    if (order?.id && !order.stub) {
      await Invoice.updateOne({ workspaceId, _id: invoice._id }, { $set: { gatewayOrderId: order.id } });
    }
  } catch {
    /* payment link optional; bank transfer still works */
  }

  await renderInvoicePdf({ invoice, business, bankDetails }).catch(() => ({}));
  const to = await recipientEmail(workspaceId, invoice.dealId);
  if (to) {
    const link = `${env.PORTAL_ORIGIN}/invoices`;
    await sendTransactional({
      to,
      subject: `Invoice ${invoice.number} from Klyro`,
      htmlContent: `<p>Your invoice ${invoice.number} is ready. View it in your portal: <a href="${link}">${link}</a></p>`,
    }).catch(() => {});
  }
  return { sent: true, invoiceId: invoice._id, gatewayOrderId: order?.id ?? null, emailed: Boolean(to) };
}

/** C22 — manually mark an invoice paid with proof (bank transfer). */
export async function markInvoicePaid({ workspaceId, invoiceId, amountMinor, proofUrl, actorId }) {
  return withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ workspaceId, _id: invoiceId }).session(session);
    if (!invoice) throw ApiError.notFound('Invoice not found');
    const amt = amountMinor ?? invoice.amountMinor - invoice.paidMinor;

    await Payment.create(
      [{ workspaceId, createdBy: actorId, invoiceId, amountMinor: amt, currency: invoice.currency, method: 'bank_transfer', status: 'captured', proofUrl }],
      { session, ordered: true },
    );
    invoice.paidMinor += amt;
    const to = invoice.paidMinor >= invoice.amountMinor ? 'paid' : 'partially_paid';
    if (invoice.status === 'draft') invoice.status = 'sent';
    assertTransition('invoice', invoice.status, to);
    invoice.status = to;
    await invoice.save({ session });
    await writeAudit(
      { workspaceId, actorId, action: 'invoice.markPaid', entity: 'invoice', entityId: invoice._id, meta: { amt, to } },
      session,
    );
    return { invoiceStatus: to, paidMinor: invoice.paidMinor };
  });
}

/**
 * C23 — email reminders for invoices that are sent/partially_paid and past
 * (or near) their due date. Runs from a daily BullMQ job. Best-effort emails.
 */
export async function sendInvoiceReminders({ workspaceId }) {
  const now = new Date();
  const invoices = await Invoice.find({
    workspaceId,
    status: { $in: ['sent', 'partially_paid'] },
    dueDate: { $ne: null, $lte: now },
    deletedAt: null,
  }).lean();

  let sent = 0;
  for (const inv of invoices) {
    const to = await recipientEmail(workspaceId, inv.dealId);
    if (!to) continue;
    const link = `${env.PORTAL_ORIGIN}/invoices`;
    await sendTransactional({
      to,
      subject: `Reminder: invoice ${inv.number} is due`,
      htmlContent: `<p>A friendly reminder that invoice ${inv.number} is due. View it here: <a href="${link}">${link}</a></p>`,
    }).catch(() => {});
    sent += 1;
  }
  return { reminded: sent };
}
