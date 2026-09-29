import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

// No real storage / email / gateway in tests.
vi.mock('../../src/config/spaces.js', () => ({
  getSpaces: () => null,
  bucket: 'test',
  keyFor: (p) => `klyro/${p}`,
}));
vi.mock('../../src/integrations/brevo/index.js', () => ({ sendTransactional: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../src/integrations/razorpay/index.js', () => ({
  createOrder: vi.fn(async () => ({ id: 'order_test', stub: false })),
  verifyWebhook: vi.fn(() => true),
}));

const { Workspace } = await import('../../src/models/Workspace.js');
const { User } = await import('../../src/models/User.js');
const { Deal } = await import('../../src/models/Deal.js');
const { Quotation } = await import('../../src/models/Quotation.js');
const { Invoice } = await import('../../src/models/Invoice.js');
const { Payment } = await import('../../src/models/Payment.js');
const { Project, Milestone } = await import('../../src/models/Project.js');
const { sendInvoice, markInvoicePaid, sendQuotation } = await import('../../src/services/billing.service.js');
const { approveMilestone } = await import('../../src/services/delivery.service.js');

describe('billing + delivery (C, ACID)', () => {
  let ws, client;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-billing' });
  });
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}), Deal.deleteMany({}), Quotation.deleteMany({}),
      Invoice.deleteMany({}), Payment.deleteMany({}), Project.deleteMany({}), Milestone.deleteMany({}),
    ]);
    client = await User.create({ name: 'C', email: 'client@x.com', passwordHash: 'x' });
  });

  it('sendInvoice marks draft→sent and stores the gateway order id', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'D', clientUserId: client._id, stage: 'won' });
    const inv = await Invoice.create({ workspaceId: ws._id, dealId: deal._id, number: 'KLY-1', amountMinor: 50000, currency: 'USD', status: 'draft' });
    const res = await sendInvoice({ workspaceId: ws._id, invoiceId: inv._id });
    expect(res.sent).toBe(true);
    expect(res.gatewayOrderId).toBe('order_test');
    const after = await Invoice.findById(inv._id);
    expect(after.status).toBe('sent');
    expect(after.gatewayOrderId).toBe('order_test');
  });

  it('markInvoicePaid records a payment and moves to paid / partially_paid', async () => {
    const inv = await Invoice.create({ workspaceId: ws._id, number: 'KLY-2', amountMinor: 10000, currency: 'USD', status: 'sent' });
    const partial = await markInvoicePaid({ workspaceId: ws._id, invoiceId: inv._id, amountMinor: 4000, actorId: client._id });
    expect(partial.invoiceStatus).toBe('partially_paid');
    const full = await markInvoicePaid({ workspaceId: ws._id, invoiceId: inv._id, amountMinor: 6000, actorId: client._id });
    expect(full.invoiceStatus).toBe('paid');
    expect(await Payment.countDocuments({ invoiceId: inv._id })).toBe(2);
  });

  it('sendQuotation marks draft→sent', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'D', clientUserId: client._id, stage: 'quote' });
    const q = await Quotation.create({ workspaceId: ws._id, dealId: deal._id, currency: 'USD', items: [{ description: 'x', unitAmountMinor: 1000, quantity: 1 }], totalMinor: 1000, status: 'draft' });
    const res = await sendQuotation({ workspaceId: ws._id, quotationId: q._id });
    expect(res.sent).toBe(true);
    expect((await Quotation.findById(q._id)).status).toBe('sent');
  });

  it('approveMilestone approves and invoices the next milestone atomically', async () => {
    const project = await Project.create({ workspaceId: ws._id, title: 'P', clientUserId: client._id, status: 'active' });
    const m1 = await Milestone.create({ workspaceId: ws._id, projectId: project._id, title: 'M1', order: 0, amountMinor: 5000, currency: 'USD', status: 'in_progress' });
    await Milestone.create({ workspaceId: ws._id, projectId: project._id, title: 'M2', order: 1, amountMinor: 7000, currency: 'USD', status: 'pending' });
    const res = await approveMilestone({ workspaceId: ws._id, milestoneId: m1._id, actorId: client._id });
    expect(res.approved).toBe(true);
    expect(res.nextInvoiceId).toBeTruthy();
    const inv = await Invoice.findById(res.nextInvoiceId);
    expect(inv.amountMinor).toBe(7000);
    expect((await Milestone.findById(m1._id)).status).toBe('approved');
  });

  it('approveMilestone on the last milestone delivers the project', async () => {
    const project = await Project.create({ workspaceId: ws._id, title: 'P', clientUserId: client._id, status: 'active' });
    const only = await Milestone.create({ workspaceId: ws._id, projectId: project._id, title: 'M', order: 0, amountMinor: 5000, currency: 'USD', status: 'in_progress' });
    const res = await approveMilestone({ workspaceId: ws._id, milestoneId: only._id, actorId: client._id });
    expect(res.nextInvoiceId).toBeNull();
    expect((await Project.findById(project._id)).status).toBe('delivered');
  });

  it('approveMilestone is idempotent', async () => {
    const project = await Project.create({ workspaceId: ws._id, title: 'P', clientUserId: client._id, status: 'active' });
    const m = await Milestone.create({ workspaceId: ws._id, projectId: project._id, title: 'M', order: 0, amountMinor: 5000, currency: 'USD', status: 'in_progress' });
    await approveMilestone({ workspaceId: ws._id, milestoneId: m._id, actorId: client._id });
    const second = await approveMilestone({ workspaceId: ws._id, milestoneId: m._id, actorId: client._id });
    expect(second.idempotent).toBe(true);
  });
});
