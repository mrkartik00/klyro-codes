import { describe, expect, it } from 'vitest';
import { warmupCap } from '../../src/services/mailboxHealth.service.js';
import { WARMUP_RAMP } from '../../src/config/constants.js';

describe('warmupCap', () => {
  it('uses the first rung when warmup has not started', () => {
    expect(warmupCap(null)).toBe(WARMUP_RAMP[0]);
  });
  it('ramps up by day', () => {
    const start = new Date('2027-01-01T00:00:00Z');
    const day3 = new Date('2027-01-04T00:00:00Z');
    expect(warmupCap(start, day3)).toBe(WARMUP_RAMP[3]);
  });
  it('caps at the final rung', () => {
    const start = new Date('2027-01-01T00:00:00Z');
    const far = new Date('2027-06-01T00:00:00Z');
    expect(warmupCap(start, far)).toBe(WARMUP_RAMP[WARMUP_RAMP.length - 1]);
  });
});
