import { mongoose } from '../config/db.js';
import { ApiError } from './ApiError.js';

/**
 * Run `fn(session)` inside a MongoDB transaction.
 *
 * Klyro requires a replica set (Atlas always is one). Unlike JankiCare, this
 * does NOT silently fall back to a non-transactional path: multi-document
 * writes must be atomic, so if transactions are unavailable we fail hard.
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (err?.code === 20 || /Transaction numbers|replica set|not supported/i.test(err?.message ?? '')) {
      throw new ApiError(500, 'Transactions require a MongoDB replica set', { code: 'NO_REPLICA_SET' });
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
