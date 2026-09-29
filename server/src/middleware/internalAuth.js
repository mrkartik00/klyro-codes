import { verify } from '../utils/hmac.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Authenticate n8n → API calls with an HMAC signature over timestamp + raw
 * body, within a replay window. Requires express.json with a verify hook that
 * stores the raw body on req.rawBody (added in app.js for /internal).
 */
export function internalAuth(req, _res, next) {
  const timestamp = req.get('X-Klyro-Timestamp');
  const signature = req.get('X-Klyro-Signature');
  if (!timestamp || !signature) return next(ApiError.unauthorized('Missing internal auth headers'));
  const raw = req.rawBody ?? JSON.stringify(req.body ?? {});
  if (!verify(timestamp, raw, signature)) return next(ApiError.unauthorized('Bad internal signature'));
  req.internal = true;
  next();
}
