import { describe, expect, it, beforeAll, beforeEach } from 'vitest';

import { Workspace } from '../../src/models/Workspace.js';
import { Deal } from '../../src/models/Deal.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { transition } from '../../src/services/transition.service.js';
import { withTransaction } from '../../src/utils/transaction.js';
import { ApiError } from '../../src/utils/ApiError.js';

describe('transition.service (ACID)', () => {
  let ws;

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-transition' });
  });

  beforeEach(async () => {
    await Deal.deleteMany({});
    await AuditLog.deleteMany({});
  });

  it('persists status change and audit log together on commit', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'Acme', stage: 'new' });
    // withTransaction may retry the body on a transient error, so reload the
    // doc inside the callback to keep it idempotent.
    await withTransaction(async (s) => {
      const fresh = await Deal.findById(deal._id).session(s);
      if (fresh.stage === 'new') {
        await transition({ doc: fresh, entity: 'deal', to: 'contacted', statusField: 'stage' }, s);
      }
    });
    expect((await Deal.findById(deal._id)).stage).toBe('contacted');
    const audits = await AuditLog.find({ entityId: deal._id });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('deal.transition');
    expect(audits[0].after).toEqual({ stage: 'contacted' });
  });

  it('rolls back the status change if the audit write fails within the txn', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'Beta', stage: 'new' });
    await expect(
      withTransaction(async (s) => {
        // Reload inside the txn so the body is idempotent: session.withTransaction
        // may re-run this callback on a transient error, and mutating a doc
        // captured outside would make a retry see the already-changed stage.
        const fresh = await Deal.findById(deal._id).session(s);
        await transition({ doc: fresh, entity: 'deal', to: 'contacted', statusField: 'stage' }, s);
        throw new Error('later step fails');
      }),
    ).rejects.toThrow('later step fails');
    // Reloaded doc keeps the original stage; no audit persisted.
    expect((await Deal.findById(deal._id)).stage).toBe('new');
    expect(await AuditLog.countDocuments({ entityId: deal._id })).toBe(0);
  });

  it('rejects an illegal transition with 409 and writes nothing', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'Gamma', stage: 'new' });
    await expect(
      withTransaction((s) =>
        transition({ doc: deal, entity: 'deal', to: 'won', statusField: 'stage' }, s),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await Deal.findById(deal._id)).stage).toBe('new');
    expect(await AuditLog.countDocuments()).toBe(0);
    expect(ApiError).toBeTruthy();
  });
});
