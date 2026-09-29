import { ApiError } from '../utils/ApiError.js';

/** Allow only the given roles. Use after requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(ApiError.forbidden('Insufficient role'));
    next();
  };
}

export const requireAdmin = requireRole('super_admin', 'admin');
