import { ApiError } from '../utils/ApiError.js';

/** Validate req.body against a Zod schema; replace body with parsed output. */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        ApiError.badRequest('Validation failed', {
          code: 'VALIDATION',
          details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }),
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(ApiError.badRequest('Invalid query', { code: 'VALIDATION' }));
    }
    req.validatedQuery = result.data;
    next();
  };
}
