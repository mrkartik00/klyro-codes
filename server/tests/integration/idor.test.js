import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { Workspace } from '../../src/models/Workspace.js';
import { User } from '../../src/models/User.js';
import { Deal } from '../../src/models/Deal.js';
import { Quotation } from '../../src/models/Quotation.js';

// A logged-in client must never read or accept a quotation that isn't theirs.
describe('portal quotation IDOR (B12)', () => {
  let app, ws, alice, bob, aliceQuote;

  const tokenFor = (user) =>
    jwt.sign({ sub: String(user._id), workspaceId: String(ws._id), role: 'client' }, env.JWT_ACCESS_SECRET, {
      expiresIn: '15m',
    });

  beforeAll(async () => {
    app = createApp();
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-idor' });
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Deal.deleteMany({}), Quotation.deleteMany({})]);
    alice = await User.create({ name: 'Alice', email: 'alice@x.com', passwordHash: 'x' });
    bob = await User.create({ name: 'Bob', email: 'bob@x.com', passwordHash: 'x' });
    // Alice owns a deal + quotation. Bob owns nothing.
    const deal = await Deal.create({ workspaceId: ws._id, title: 'Alice Co', clientUserId: alice._id, stage: 'quote' });
    aliceQuote = await Quotation.create({
      workspaceId: ws._id,
      dealId: deal._id,
      currency: 'USD',
      items: [{ description: 'Site', unitAmountMinor: 100000, quantity: 1 }],
      totalMinor: 100000,
      status: 'sent',
    });
  });

  it('lets the owner read their quotation', async () => {
    const res = await request(app)
      .get(`/api/v1/me/quotations/${aliceQuote._id}`)
      .set('Authorization', `Bearer ${tokenFor(alice)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalMinor).toBe(100000);
  });

  it('returns 404 when another client tries to read it', async () => {
    const res = await request(app)
      .get(`/api/v1/me/quotations/${aliceQuote._id}`)
      .set('Authorization', `Bearer ${tokenFor(bob)}`);
    expect(res.status).toBe(404);
  });

  it('refuses when another client tries to accept it', async () => {
    const res = await request(app)
      .post(`/api/v1/me/quotations/${aliceQuote._id}/accept`)
      .set('Authorization', `Bearer ${tokenFor(bob)}`)
      .send({});
    expect(res.status).toBe(404);
    // Quote remains unaccepted.
    expect((await Quotation.findById(aliceQuote._id)).status).toBe('sent');
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get(`/api/v1/me/quotations/${aliceQuote._id}`);
    expect(res.status).toBe(401);
  });
});
