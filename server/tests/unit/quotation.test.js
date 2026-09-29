import { describe, expect, it } from 'vitest';
import { computeTotal } from '../../src/services/quotation.service.js';

describe('quotation.computeTotal (minor units)', () => {
  it('sums items with quantities', () => {
    expect(
      computeTotal({ items: [{ unitAmountMinor: 100000, quantity: 2 }, { unitAmountMinor: 50000 }] }),
    ).toBe(250000);
  });

  it('applies discount then tax with half-up rounding', () => {
    // 100000 − 10% = 90000; +20% tax = 108000
    expect(
      computeTotal({ items: [{ unitAmountMinor: 100000 }], discountPercent: 10, taxPercent: 20 }),
    ).toBe(108000);
  });

  it('rounds fractional minor units', () => {
    // 999 − 33% = 669.33 → 669
    expect(computeTotal({ items: [{ unitAmountMinor: 999 }], discountPercent: 33 })).toBe(669);
  });
});
