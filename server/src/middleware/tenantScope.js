import { ApiError } from '../utils/ApiError.js';

/**
 * Scope every DB query in the request to the caller's workspace.
 * Populates req.workspaceId from the authenticated membership (set by auth
 * middleware). Reject if missing.
 */
export function tenantScope(req, _res, next) {
  const wsId = req.auth?.workspaceId;
  if (!wsId) return next(ApiError.forbidden('No workspace context'));
  req.workspaceId = wsId;
  next();
}
