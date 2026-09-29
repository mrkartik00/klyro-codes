import { describe, expect, it } from 'vitest';
import { addBusinessDays, isWithinSendWindow } from '../../src/utils/timezone.js';

describe('timezone business days', () => {
  it('skips the weekend when adding business days', () => {
    // Fri 2027-01-01 (UTC). +1 business day → Mon 2027-01-04.
    const fri = new Date('2027-01-01T12:00:00Z');
    const res = addBusinessDays(fri, 1, 'UTC');
    expect(res.getUTCDate()).toBe(4);
  });

  it('returns same date for 0 days', () => {
    const d = new Date('2027-01-06T00:00:00Z');
    expect(addBusinessDays(d, 0).getTime()).toBe(d.getTime());
  });

  it('respects the send window hours', () => {
    const wedMorning = new Date('2027-01-06T15:00:00Z'); // 15:00 UTC Wed
    expect(
      isWithinSendWindow(wedMorning, { startHour: 9, endHour: 17, businessDaysOnly: true }, 'UTC'),
    ).toBe(true);
    const wedEvening = new Date('2027-01-06T20:00:00Z');
    expect(
      isWithinSendWindow(wedEvening, { startHour: 9, endHour: 17, businessDaysOnly: true }, 'UTC'),
    ).toBe(false);
  });

  it('blocks weekends when businessDaysOnly', () => {
    const sat = new Date('2027-01-02T12:00:00Z');
    expect(
      isWithinSendWindow(sat, { startHour: 9, endHour: 17, businessDaysOnly: true }, 'UTC'),
    ).toBe(false);
  });
});
