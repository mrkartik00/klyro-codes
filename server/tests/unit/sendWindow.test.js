import { describe, it, expect } from 'vitest';
import { isWithinSendWindow } from '../../src/utils/timezone.js';

describe('isWithinSendWindow', () => {
  const all = { startHour: 0, endHour: 24, businessDaysOnly: false };
  it('treats midnight as hour 0, not 24', () => {
    expect(isWithinSendWindow(new Date('2026-09-30T00:17:00Z'), all, 'UTC')).toBe(true);
  });
  it('respects the window in the lead timezone', () => {
    const nine = { startHour: 9, endHour: 17, businessDaysOnly: false };
    // 14:00 UTC = 10:00 in New York (EDT)
    expect(isWithinSendWindow(new Date('2026-09-30T14:00:00Z'), nine, 'America/New_York')).toBe(true);
    // 22:00 UTC = 18:00 in New York
    expect(isWithinSendWindow(new Date('2026-09-30T22:00:00Z'), nine, 'America/New_York')).toBe(false);
  });
  it('skips weekends when businessDaysOnly', () => {
    const w = { startHour: 0, endHour: 24, businessDaysOnly: true };
    expect(isWithinSendWindow(new Date('2026-10-03T12:00:00Z'), w, 'UTC')).toBe(false); // Saturday
  });
});
