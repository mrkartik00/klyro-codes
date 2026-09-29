import { ApiError } from './ApiError.js';

/** Money is stored and computed in integer minor units to avoid float error. */
export function money(amountMinor, currency) {
  if (!Number.isInteger(amountMinor)) throw ApiError.badRequest('amountMinor must be an integer');
  return Object.freeze({ amountMinor, currency });
}

export function addMoney(a, b) {
  if (a.currency !== b.currency) throw ApiError.badRequest('Currency mismatch');
  return money(a.amountMinor + b.amountMinor, a.currency);
}

/** Apply a percentage discount, rounding half-up to the nearest minor unit. */
export function applyDiscount(m, percent) {
  if (percent < 0 || percent > 100) throw ApiError.badRequest('Discount must be 0–100');
  const discounted = Math.round(m.amountMinor * (1 - percent / 100));
  return money(discounted, m.currency);
}

export function sumLineItems(items) {
  if (items.length === 0) throw ApiError.badRequest('No line items');
  const currency = items[0].currency;
  const total = items.reduce((acc, it) => {
    if (it.currency !== currency) throw ApiError.badRequest('Currency mismatch');
    return acc + it.amountMinor * (it.quantity ?? 1);
  }, 0);
  return money(total, currency);
}

export function format(m) {
  const symbol = { USD: '$', GBP: '£', INR: '₹' }[m.currency] ?? '';
  return `${symbol}${(m.amountMinor / 100).toFixed(2)}`;
}
