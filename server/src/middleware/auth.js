import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Verify the access token and attach req.auth = { userId, workspaceId, role }. */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized('Missing token'));
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.auth = { userId: payload.sub, workspaceId: payload.workspaceId, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}
