import { describe, it, expect } from 'vitest';
import { cn, formatMoney, formatDate } from './utils.js';

describe('portal utils', () => {
  it('joins class names, flattening + trimming', () => {
    expect(cn('a', ['b', false], null, 'c')).toBe('a b c');
  });
  it('formats money', () => {
    expect(formatMoney(250000, 'USD')).toBe('$2,500.00');
  });
  it('handles empty dates', () => {
    expect(formatDate(null)).toBe('—');
  });
});
