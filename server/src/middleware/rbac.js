import { ApiError } from '../utils/ApiError.js';

/** Allow only the given roles. Use after requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(ApiError.forbidden('Insufficient role'));
    next();
  };
}

/**
 * B16 — admins MUST have 2FA enabled to use admin routes. If not yet enabled,
 * only 401 with a setup code so the client can redirect to the 2FA setup flow
 * (which lives under /auth/2fa/* and is not gated by this middleware).
 */
export function requireTwoFactor(req, _res, next) {
  if (!req.auth) return next(ApiError.unauthorized());
  if (!req.auth.twoFactorEnabled) {
    return next(new ApiError(403, 'Two-factor authentication required', { code: 'TOTP_SETUP_REQUIRED' }));
  }
  next();
}

export const requireAdmin = requireRole('super_admin', 'admin');
