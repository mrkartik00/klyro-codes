import { describe, expect, it } from 'vitest';
import { stripQuotedAndSignature, redactPii, minimiseForAi } from '../../src/utils/pii.js';

describe('pii minimisation (B17)', () => {
  it('strips Gmail quoted history', () => {
    const t = 'Sounds good, what is the cost?\n\nOn Mon, Jan 1, 2026 at 9:00 AM John <j@x.com> wrote:\n> our pitch';
    expect(stripQuotedAndSignature(t)).toBe('Sounds good, what is the cost?');
  });

  it('strips a signature block', () => {
    const t = 'Yes please.\n\nRegards,\nJohn Smith\nAcme Ltd';
    expect(stripQuotedAndSignature(t)).toBe('Yes please.');
  });

  it('redacts emails, phones and links', () => {
    const t = 'Call me on +1 415 555 1234 or email john@acme.com, see https://acme.com/x';
    const r = redactPii(t);
    expect(r).not.toContain('john@acme.com');
    expect(r).not.toContain('415 555 1234');
    expect(r).not.toContain('https://acme.com');
    expect(r).toContain('[email]');
    expect(r).toContain('[phone]');
    expect(r).toContain('[link]');
  });

  it('minimiseForAi combines stripping + redaction + length cap', () => {
    const t = 'Interested! Reach me at a@b.com\n\nOn ... wrote:\n> quoted';
    const out = minimiseForAi(t);
    expect(out).toContain('Interested!');
    expect(out).toContain('[email]');
    expect(out).not.toContain('quoted');
  });
});
