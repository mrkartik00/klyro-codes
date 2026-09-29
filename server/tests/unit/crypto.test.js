import { describe, expect, it } from 'vitest';
import { encrypt, decrypt } from '../../src/utils/crypto.js';
import { sign, verify } from '../../src/utils/hmac.js';

describe('crypto (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const secret = 'brevo-api-key-xyz';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });
  it('produces different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });
  it('rejects tampered ciphertext', () => {
    const enc = encrypt('secret');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});

describe('hmac (internal auth)', () => {
  it('verifies a fresh signature', () => {
    const ts = String(Date.now());
    const body = JSON.stringify({ a: 1 });
    expect(verify(ts, body, sign(ts, body))).toBe(true);
  });
  it('rejects a stale timestamp', () => {
    const ts = String(Date.now() - 10 * 60 * 1000);
    const body = '{}';
    expect(verify(ts, body, sign(ts, body))).toBe(false);
  });
  it('rejects a wrong signature', () => {
    const ts = String(Date.now());
    expect(verify(ts, '{}', 'deadbeef')).toBe(false);
  });
});
