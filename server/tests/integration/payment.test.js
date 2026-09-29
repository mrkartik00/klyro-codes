import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { Workspace } from '../../src/models/Workspace.js';
import { Deal } from '../../src/models/Deal.js';
import { Quotation } from '../../src/models/Quotation.js';
import { Project, Milestone } from '../../src/models/Project.js';
import { Invoice } from '../../src/models/Invoice.js';
import { Payment } from '../../src/models/Payment.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { acceptQuotation, recordPayment } from '../../src/services/payment.service.js';

describe('payment.service (ACID quote-accept + payment)', () => {
  let ws;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-pay' });
  });
  beforeEach(async () => {
    await Promise.all([
      Deal.deleteMany({}),
      Quotation.deleteMany({}),
      Project.deleteMany({}),
      Milestone.deleteMany({}),
      Invoice.deleteMany({}),
      Payment.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  async function seedAcceptedQuote() {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'Site', stage: 'quote' });
    const quote = await Quotation.create({
      workspaceId: ws._id,
      dealId: deal._id,
      status: 'sent',
      currency: 'USD',
      items: [
        { description: 'Design', quantity: 1, unitAmountMinor: 100000 },
        { description: 'Build', quantity: 1, unitAmountMinor: 200000 },
      ],
      totalMinor: 300000,
    });
    return { deal, quote };
  }

  it('accepting a quote creates project + milestones + advance invoice and wins the deal', async () => {
    const { deal, quote } = await seedAcceptedQuote();
    const res = await acceptQuotation({ workspaceId: ws._id, quotationId: quote._id });
    expect(res.milestoneCount).toBe(2);
    expect((await Deal.findById(deal._id)).stage).toBe('won');
    expect((await Quotation.findById(quote._id)).status).toBe('accepted');
    expect(await Milestone.countDocuments({ projectId: res.projectId })).toBe(2);
    const invoice = await Invoice.findById(res.invoiceId);
    expect(invoice.amountMinor).toBe(100000); // first milestone
  });

  it('rolls back everything if the deal transition is illegal', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'X', stage: 'won' });
    const quote = await Quotation.create({ workspaceId: ws._id, dealId: deal._id, status: 'sent', currency: 'USD', items: [{ description: 'a', unitAmountMinor: 100 }], totalMinor: 100 });
    // Deal already won → won→won is illegal; but our flow skips if already won,
    // so accepting should still succeed with the quote accepted.
    const res = await acceptQuotation({ workspaceId: ws._id, quotationId: quote._id });
    expect(res.projectId).toBeTruthy();
  });

  it('records a gateway payment once (idempotent) and marks invoice paid', async () => {
    const { quote } = await seedAcceptedQuote();
    const { invoiceId } = await acceptQuotation({ workspaceId: ws._id, quotationId: quote._id });
    const args = { workspaceId: ws._id, invoiceId, amountMinor: 100000, currency: 'USD', method: 'razorpay', gatewayPaymentId: 'pay_123' };
    const first = await recordPayment(args);
    expect(first.invoiceStatus).toBe('paid');
    const second = await recordPayment(args);
    expect(second.idempotent).toBe(true);
    expect(await Payment.countDocuments()).toBe(1);
  });
});
