import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { Workspace } from '../../src/models/Workspace.js';
import { Deal } from '../../src/models/Deal.js';
import { Quotation } from '../../src/models/Quotation.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { createQuotation, setQuotationStatus, reviseQuotation } from '../../src/services/quotation.service.js';
import { ApiError } from '../../src/utils/ApiError.js';

describe('quotation.service (ACID lifecycle)', () => {
  let ws;
  let deal;

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-quote' });
  });
  beforeEach(async () => {
    await Promise.all([Quotation.deleteMany({}), Deal.deleteMany({}), AuditLog.deleteMany({})]);
    deal = await Deal.create({ workspaceId: ws._id, title: 'Q', stage: 'new' });
  });

  it('creates a quote with the correct total and moves draft → sent → accepted', async () => {
    const quote = await createQuotation({
      workspaceId: ws._id,
      dealId: deal._id,
      currency: 'USD',
      items: [{ description: 'Website', unitAmountMinor: 200000, quantity: 1 }],
      taxPercent: 10,
    });
    expect(quote.totalMinor).toBe(220000);
    await setQuotationStatus({ workspaceId: ws._id, quotationId: quote._id, to: 'sent' });
    const accepted = await setQuotationStatus({ workspaceId: ws._id, quotationId: quote._id, to: 'accepted' });
    expect(accepted.status).toBe('accepted');
    expect(await AuditLog.countDocuments({ action: 'quotation.transition' })).toBe(2);
  });

  it('rejects an illegal status jump (draft → accepted)', async () => {
    const quote = await createQuotation({
      workspaceId: ws._id,
      dealId: deal._id,
      currency: 'USD',
      items: [{ description: 'x', unitAmountMinor: 1000 }],
    });
    await expect(
      setQuotationStatus({ workspaceId: ws._id, quotationId: quote._id, to: 'accepted' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('revising a sent quote supersedes it and bumps the version', async () => {
    const quote = await createQuotation({
      workspaceId: ws._id,
      dealId: deal._id,
      currency: 'USD',
      items: [{ description: 'v1', unitAmountMinor: 100000 }],
    });
    await setQuotationStatus({ workspaceId: ws._id, quotationId: quote._id, to: 'sent' });
    const v2 = await reviseQuotation({
      workspaceId: ws._id,
      quotationId: quote._id,
      changes: { items: [{ description: 'v2', unitAmountMinor: 150000 }] },
    });
    expect(v2.version).toBe(2);
    expect(v2.totalMinor).toBe(150000);
    expect((await Quotation.findById(quote._id)).status).toBe('superseded');
  });
});
