import { AuditLog } from '../models/AuditLog.js';

/**
 * Write an audit entry. MUST be passed the active session so it commits/rolls
 * back together with the change it records.
 */
export async function writeAudit(
  { workspaceId, actorId, actorType = 'user', action, entity, entityId, before, after, meta },
  session,
) {
  const [doc] = await AuditLog.create(
    [{ workspaceId, actorId, actorType, action, entity, entityId, before, after, meta }],
    { session, ordered: true },
  );
  return doc;
}
