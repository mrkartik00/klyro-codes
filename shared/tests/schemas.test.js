import { describe, expect, it } from 'vitest';
import { enquirySchema, loginSchema } from '../src/schemas/index.js';
import { TRANSITIONS, DEAL_STAGES } from '../src/enums.js';

describe('enquirySchema', () => {
  const valid = { name: 'Jane Doe', email: 'Jane@Example.com', message: 'Need a new website please.' };

  it('accepts a valid enquiry and lowercases the email', () => {
    expect(enquirySchema.parse(valid).email).toBe('jane@example.com');
  });

  it('accepts a filled honeypot (route drops it silently, bots get a normal 200)', () => {
    expect(enquirySchema.safeParse({ ...valid, website_url: 'http://spam' }).success).toBe(true);
  });

  it('rejects a too-short message', () => {
    expect(enquirySchema.safeParse({ ...valid, message: 'hi' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts an optional 6-digit TOTP', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: 'x', totp: '123456' });
    expect(r.success).toBe(true);
  });
  it('rejects a malformed TOTP', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', totp: '12' }).success).toBe(false);
  });
});

describe('TRANSITIONS', () => {
  it('covers every deal stage', () => {
    for (const stage of DEAL_STAGES) {
      expect(TRANSITIONS.deal[stage]).toBeDefined();
    }
  });
  it('does not allow won → anything', () => {
    expect(TRANSITIONS.deal.won).toEqual([]);
  });
});
