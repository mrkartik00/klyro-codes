import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Idempotency for mutating internal/webhook routes.
 * Requires an `Idempotency-Key` header. If a response was already stored for
 * (scope, key), replay it. Otherwise attach res hooks to persist the result.
 */
export function idempotency(scope) {
  return async (req, res, next) => {
    const key = req.get('Idempotency-Key');
    if (!key) return next(ApiError.badRequest('Missing Idempotency-Key header'));

    const existing = await IdempotencyKey.findOne({ scope, key }).lean();
    if (existing?.response !== undefined) {
      return res.status(existing.statusCode ?? 200).json(existing.response);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Persist best-effort after responding; unique index prevents races.
      IdempotencyKey.updateOne(
        { scope, key },
        { $set: { statusCode: res.statusCode, response: body, expiresAt: IdempotencyKey.ttlDate() } },
        { upsert: true },
      ).catch(() => {});
      return originalJson(body);
    };
    next();
  };
}
