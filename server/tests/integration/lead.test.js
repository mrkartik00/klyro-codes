import { describe, expect, it, beforeAll, beforeEach } from 'vitest';

import { Workspace } from '../../src/models/Workspace.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { ingestBatch, mergeLeads } from '../../src/services/lead.service.js';

describe('lead.service (ACID ingest + merge)', () => {
  let ws;

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-lead' });
  });
  beforeEach(async () => {
    await Promise.all([Organization.deleteMany({}), Contact.deleteMany({}), Lead.deleteMany({})]);
  });

  const rec = (o) => ({ name: 'Biz', country: 'US', ...o });

  it('creates leads and dedupes by placeId/domain/phone within a batch', async () => {
    const res = await ingestBatch({
      workspaceId: ws._id,
      source: 'maps',
      reference: 'job1',
      records: [
        rec({ placeId: 'p1', website: 'https://acme.com', email: 'hi@acme.com' }),
        rec({ placeId: 'p1' }), // dup by placeId
        rec({ domain: 'acme.com' }), // dup by domain
        rec({ placeId: 'p2', phone: '+1 415 555 0100' }),
      ],
    });
    expect(res.received).toBe(4);
    expect(res.created).toBe(2);
    expect(await Lead.countDocuments()).toBe(2);
  });

  it('is idempotent across repeated batches (same dedupe keys)', async () => {
    const records = [rec({ placeId: 'x', website: 'x.com', email: 'a@x.com' })];
    await ingestBatch({ workspaceId: ws._id, source: 'maps', reference: 'j', records });
    const second = await ingestBatch({ workspaceId: ws._id, source: 'maps', reference: 'j', records });
    expect(second.created).toBe(0);
    expect(await Lead.countDocuments()).toBe(1);
  });

  it('merges two leads atomically, moving contacts and soft-deleting the loser', async () => {
    await ingestBatch({
      workspaceId: ws._id,
      source: 'maps',
      reference: 'j',
      records: [
        rec({ placeId: 'w', website: 'w.com', email: 'win@w.com' }),
        rec({ placeId: 'l', website: 'l.com', email: 'lose@l.com' }),
      ],
    });
    const [winner, loser] = await Lead.find().sort({ createdAt: 1 });
    await mergeLeads({ workspaceId: ws._id, winnerId: winner._id, loserId: loser._id });

    const reloadedLoser = await Lead.findById(loser._id);
    expect(reloadedLoser.deletedAt).toBeTruthy();
    // Loser's contact now points at the winner's org.
    const moved = await Contact.findOne({ email: 'lose@l.com' });
    expect(String(moved.organizationId)).toBe(String(winner.organizationId));
  });
});
