import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// Health pings DB and Redis; stub both so this test needs no live services.
vi.mock('../../src/config/db.js', () => ({
  pingDb: vi.fn(async () => true),
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  mongoose: {},
}));
vi.mock('../../src/config/redis.js', () => ({
  pingRedis: vi.fn(async () => true),
  getRedis: vi.fn(),
  closeRedis: vi.fn(),
}));

const { createApp } = await import('../../src/app.js');

describe('GET /api/v1/health', () => {
  let app;
  beforeAll(() => {
    app = createApp();
  });
  afterAll(() => vi.restoreAllMocks());

  it('returns 200 and ok when dependencies are up', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.checks).toEqual({ db: true, redis: true });
  });

  it('liveness probe returns ok', async () => {
    const res = await request(app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('unknown route returns 404 in the error envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
