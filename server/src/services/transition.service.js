import { assertTransition } from '../utils/stateMachine.js';
import { writeAudit } from './audit.service.js';

/**
 * Move `doc.statusField` from its current value to `to`, validating against the
 * entity's transition map, saving the doc, and writing an audit entry — all in
 * the same session/transaction. Returns the saved doc.
 */
export async function transition(
  { doc, entity, to, statusField = 'status', actorId, actorType = 'user', meta },
  session,
) {
  const from = doc[statusField];
  assertTransition(entity, from, to);
  doc[statusField] = to;
  await doc.save({ session });
  await writeAudit(
    {
      workspaceId: doc.workspaceId,
      actorId,
      actorType,
      action: `${entity}.transition`,
      entity,
      entityId: doc._id,
      before: { [statusField]: from },
      after: { [statusField]: to },
      meta,
    },
    session,
  );
  return doc;
}
