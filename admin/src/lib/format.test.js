import { describe, it, expect } from 'vitest';
import { formatMoney, toMinor, formatDate, classNames } from './format.js';

describe('admin format utils', () => {
  it('formats minor units as currency', () => {
    expect(formatMoney(150000, 'USD')).toBe('$1,500.00');
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('converts major to minor units', () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor('5')).toBe(500);
  });
  it('handles empty dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
  it('joins class names', () => {
    expect(classNames('a', false, 'b', null, 'c')).toBe('a b c');
  });
});
