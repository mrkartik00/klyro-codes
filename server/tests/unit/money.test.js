import { describe, expect, it } from 'vitest';
import { money, addMoney, applyDiscount, sumLineItems, format } from '../../src/utils/money.js';
import { ApiError } from '../../src/utils/ApiError.js';

describe('money', () => {
  it('rejects non-integer minor units', () => {
    expect(() => money(10.5, 'USD')).toThrow(ApiError);
  });
  it('adds same-currency amounts', () => {
    expect(addMoney(money(100, 'USD'), money(250, 'USD')).amountMinor).toBe(350);
  });
  it('rejects currency mismatch on add', () => {
    expect(() => addMoney(money(100, 'USD'), money(100, 'GBP'))).toThrow(ApiError);
  });
  it('applies a discount with half-up rounding', () => {
    expect(applyDiscount(money(999, 'USD'), 10).amountMinor).toBe(899);
  });
  it('sums line items with quantity', () => {
    const total = sumLineItems([
      { amountMinor: 1000, currency: 'USD', quantity: 2 },
      { amountMinor: 500, currency: 'USD' },
    ]);
    expect(total.amountMinor).toBe(2500);
  });
  it('formats with a currency symbol', () => {
    expect(format(money(240000, 'USD'))).toBe('$2400.00');
  });
});
