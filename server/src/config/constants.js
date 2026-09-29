// Cross-cutting constants. Domain enums live in @klyro/shared.
export const API_PREFIX = '/api/v1';

export const REDIS_KEYS = Object.freeze({
  rateLimit: 'rl:',
});

// Mailbox safety thresholds (fractions).
export const MAILBOX_LIMITS = Object.freeze({
  maxBounceRate: 0.03,
  maxComplaintRate: 0.001,
  minSendGapMs: 60_000,
});

// Warmup ramp: daily cap by day number since warmup start.
export const WARMUP_RAMP = Object.freeze([5, 5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30]);

export const IDEMPOTENCY_TTL_SECONDS = 48 * 60 * 60;
export const INTERNAL_HMAC_WINDOW_MS = 5 * 60 * 1000;
