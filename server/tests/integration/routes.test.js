import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// Route-level guards: auth required, public validation, webhook signature,
// internal HMAC. Complements idor.test.js (portal ownership).
describe('route guards (H52)', () => {
  let app;
  beforeAll(() => {
    app = createApp();
  });

  it('admin routes require authentication', async () => {
    const res = await request(app).get('/api/v1/admin/leads');
    expect(res.status).toBe(401);
  });

  it('portal routes require authentication', async () => {
    const res = await request(app).get('/api/v1/me/projects');
    expect(res.status).toBe(401);
  });

  it('internal routes reject a missing/invalid HMAC signature', async () => {
    const res = await request(app)
      .post('/api/v1/internal/sends/claim')
      .send({ workspaceId: 'x', enrollmentId: 'y', stepOrder: 1 });
    expect([400, 401]).toContain(res.status);
  });

  it('public enquiry validates the body', async () => {
    const res = await request(app).post('/api/v1/public/enquiries').send({});
    expect(res.status).toBe(400);
  });

  it('razorpay webhook rejects a bad signature', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('X-Razorpay-Signature', 'bad')
      .send({ event: 'payment.captured' });
    expect(res.status).toBe(400);
  });

  it('click-tracking redirect rejects a forged token', async () => {
    const res = await request(app).get('/api/v1/public/t/c/forged.token');
    expect(res.status).toBe(400);
  });

  it('unknown route returns the 404 envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
