import { describe, it, expect } from 'vitest';
import { draftOf, dealValueMinor } from './drafts.js';

describe('draftOf', () => {
  it('reads the { subject, body } shape the API returns', () => {
    expect(draftOf({ draft: { subject: 'Hi', body: 'Hello' } })).toEqual({ subject: 'Hi', body: 'Hello' });
  });
  it('tolerates legacy string drafts', () => {
    expect(draftOf({ draft: 'plain', subject: 'S' })).toEqual({ subject: 'S', body: 'plain' });
  });
  it('never returns an object as body (no [object Object])', () => {
    expect(typeof draftOf({ draft: { subject: 'x' } }).body).toBe('string');
  });
});

describe('dealValueMinor', () => {
  it('handles the { amountMinor, currency } shape', () => {
    expect(dealValueMinor({ value: { amountMinor: 5000, currency: 'GBP' } })).toEqual({ minor: 5000, currency: 'GBP' });
  });
  it('returns null for zero/missing values', () => {
    expect(dealValueMinor({ value: { amountMinor: 0 } })).toBeNull();
    expect(dealValueMinor({})).toBeNull();
  });
});
