import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { REDIS_KEYS } from '../config/constants.js';
import { isTest } from '../config/env.js';

// Redis-backed store so limits hold across the whole PM2 cluster (B15). Falls
// back to the library's in-memory store if Redis is unavailable (or in tests).
function store(prefix) {
  if (isTest) return undefined;
  try {
    const client = getRedis();
    return new RedisStore({
      prefix: `${REDIS_KEYS.rateLimit}${prefix}:`,
      sendCommand: (...args) => client.call(...args),
    });
  } catch (err) {
    logger.warn({ err }, 'Redis rate-limit store unavailable; using in-memory');
    return undefined;
  }
}

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: store('api'),
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' } },
});

// Brute-force guard: only FAILED attempts count (wrong password, bad code), so
// normal register → verify → login flows never trip it.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: store('auth'),
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts' } },
});

// Stricter limiter for public inbound forms (enquiries, project requests).
export const publicFormLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: store('pubform'),
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Slow down' } },
});
