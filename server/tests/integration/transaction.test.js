import { describe, expect, it, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { withTransaction } from '../../src/utils/transaction.js';

// Proves multi-document writes are atomic on a replica set: commit persists all,
// rollback persists none. Uses the shared connection from tests/setup.js.
describe('withTransaction (replica set)', () => {
  let Widget;

  beforeAll(async () => {
    Widget = mongoose.models.Widget ?? mongoose.model('Widget', new mongoose.Schema({ name: String }));
    await Widget.createCollection();
    await Widget.deleteMany({});
  });

  it('commits all writes on success', async () => {
    await withTransaction(async (session) => {
      await Widget.create([{ name: 'a' }, { name: 'b' }], { session, ordered: true });
    });
    expect(await Widget.countDocuments()).toBe(2);
  });

  it('rolls back every write when the body throws', async () => {
    const before = await Widget.countDocuments();
    await expect(
      withTransaction(async (session) => {
        await Widget.create([{ name: 'c' }], { session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await Widget.countDocuments()).toBe(before);
  });
});
