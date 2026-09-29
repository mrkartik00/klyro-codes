import { TRANSITIONS } from '@klyro/shared/enums';
import { ApiError } from './ApiError.js';

/**
 * Guard a status change against the allowed transition map for an entity.
 * Returns the target status when valid; throws ApiError(409) otherwise.
 * Persisting the change and writing the audit log is the caller's job
 * (inside the same transaction).
 */
export function assertTransition(entity, from, to) {
  const map = TRANSITIONS[entity];
  if (!map) throw new ApiError(500, `Unknown entity for state machine: ${entity}`);
  const allowed = map[from];
  if (!allowed) throw new ApiError(409, `Unknown ${entity} status: ${from}`);
  if (!allowed.includes(to)) {
    throw ApiError.conflict(`Illegal ${entity} transition: ${from} → ${to}`, {
      code: 'ILLEGAL_TRANSITION',
      details: { entity, from, to, allowed },
    });
  }
  return to;
}

export function canTransition(entity, from, to) {
  return Boolean(TRANSITIONS[entity]?.[from]?.includes(to));
}
