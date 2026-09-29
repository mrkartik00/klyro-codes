import { describe, expect, it } from 'vitest';
import { makeToken, readToken, unsubscribeToken } from '../../src/utils/publicToken.js';

describe('publicToken (signed one-click tokens)', () => {
  it('round-trips a payload', () => {
    const t = makeToken({ k: 'u', w: 'ws1', e: 'a@b.com' });
    expect(readToken(t)).toEqual({ k: 'u', w: 'ws1', e: 'a@b.com' });
  });

  it('rejects a tampered token', () => {
    const t = unsubscribeToken('ws1', 'a@b.com');
    const [payload] = t.split('.');
    expect(readToken(`${payload}.deadbeefdeadbeefdeadbeef`)).toBeNull();
  });

  it('rejects a forged payload with no/invalid signature', () => {
    const forged = Buffer.from(JSON.stringify({ k: 'u', w: 'ws1', e: 'victim@x.com' })).toString('base64url');
    expect(readToken(forged)).toBeNull();
    expect(readToken(`${forged}.`)).toBeNull();
    expect(readToken('garbage')).toBeNull();
  });
});
