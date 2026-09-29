import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Signed, URL-safe tokens for public one-click actions (unsubscribe, click
// redirect). Server-to-recipient only — never a browser-held secret. The HMAC
// prevents forging a token for an arbitrary email/target.
const SECRET = () => env.INTERNAL_HMAC_SECRET;

function sign(payloadB64) {
  return crypto.createHmac('sha256', SECRET()).update(payloadB64).digest('base64url').slice(0, 24);
}

/** Build `<base64url(json)>.<sig>` */
export function makeToken(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Verify and decode a token; returns the object or null if tampered/invalid. */
export function readToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export const unsubscribeToken = (workspaceId, email) =>
  makeToken({ k: 'u', w: String(workspaceId), e: String(email).toLowerCase() });

export const clickToken = (messageId, url) => makeToken({ k: 'c', m: String(messageId), u: url });
