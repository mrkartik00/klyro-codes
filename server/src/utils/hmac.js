import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { INTERNAL_HMAC_WINDOW_MS } from '../config/constants.js';

/** HMAC-SHA256 signature over `${timestamp}.${rawBody}` for internal (n8n ↔ API) calls. */
export function sign(timestamp, rawBody, secret = env.INTERNAL_HMAC_SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/** Constant-time verify with a replay window. */
export function verify(timestamp, rawBody, signature, secret = env.INTERNAL_HMAC_SECRET) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > INTERNAL_HMAC_WINDOW_MS) return false;
  const expected = sign(timestamp, rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
