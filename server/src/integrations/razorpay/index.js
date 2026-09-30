import crypto from 'node:crypto';
import { cfg } from '../../config/secrets.js';
import { logger } from '../../config/logger.js';

const BASE = 'https://api.razorpay.com/v1';

function authHeader() {
  const id = cfg('RAZORPAY_KEY_ID');
  const secret = cfg('RAZORPAY_KEY_SECRET');
  if (!id || !secret) return null;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

/** Create a Razorpay order for an invoice. No-op object when unconfigured. */
export async function createOrder({ amountMinor, currency, receipt }) {
  const auth = authHeader();
  if (!auth) {
    logger.warn('Razorpay not configured; returning stub order');
    return { id: `order_stub_${crypto.randomBytes(6).toString('hex')}`, stub: true };
  }
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountMinor, currency, receipt }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
  return res.json();
}

/** Verify a Razorpay webhook signature (HMAC-SHA256 over the raw body). */
export function verifyWebhook(rawBody, signature) {
  const secret = cfg('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature ?? ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
