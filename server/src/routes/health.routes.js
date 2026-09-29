import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { pingDb } from '../config/db.js';
import { pingRedis } from '../config/redis.js';

export const healthRouter = Router();

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [db, redis] = await Promise.allSettled([pingDb(), pingRedis()]);
    const checks = {
      db: db.status === 'fulfilled' && db.value,
      redis: redis.status === 'fulfilled' && redis.value,
    };
    const healthy = Object.values(checks).every(Boolean);
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: { status: healthy ? 'ok' : 'degraded', checks, uptime: process.uptime() },
    });
  }),
);

// Liveness probe: no external dependencies.
healthRouter.get('/health/live', (_req, res) => ok(res, { status: 'ok' }));
