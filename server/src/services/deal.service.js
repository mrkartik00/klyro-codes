import { Deal } from '../models/Deal.js';
import { withTransaction } from '../utils/transaction.js';
import { transition } from './transition.service.js';
import { ApiError } from '../utils/ApiError.js';

/** Move a deal to a new stage through the guarded state machine. */
export async function moveDeal({ workspaceId, dealId, to, actorId, lostReason }) {
  return withTransaction(async (session) => {
    const deal = await Deal.findOne({ workspaceId, _id: dealId }).session(session);
    if (!deal) throw ApiError.notFound('Deal not found');
    if (to === 'lost' && lostReason) deal.lostReason = lostReason;
    await transition(
      { doc: deal, entity: 'deal', to, statusField: 'stage', actorId },
      session,
    );
    return deal;
  });
}
