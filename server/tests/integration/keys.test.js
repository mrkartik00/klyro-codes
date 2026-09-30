import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { Workspace } from '../../src/models/Workspace.js';
import { User } from '../../src/models/User.js';
import { Setting } from '../../src/models/Setting.js';
import { cfg } from '../../src/config/secrets.js';
import { reasonFor } from '../../src/services/integrationStatus.service.js';

describe('Settings → API keys', () => {
  let app, token;
  const api = (m, u) => request(app)[m](`/api/v1/admin/settings/keys${u}`).set('Authorization', `Bearer ${token}`);
  beforeAll(async () => {
    app = createApp();
    const ws = await Workspace.create({ name: 'K', slug: 'klyro-keys' });
    const admin = await User.create({ name: 'A', email: 'keys@klyro.codes', passwordHash: 'x', role: 'admin' });
    token = jwt.sign({ sub: String(admin._id), workspaceId: String(ws._id), role: 'admin', twoFactorEnabled: true }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  });

  it('stores a key encrypted, masks it, overrides .env and falls back on remove', async () => {
    expect((await api('put', '/BRAVE_API_KEY').send({ value: 'BSAfirstkey123456 , BSAsecondkey98765' })).status).toBe(200);
    const row = await Setting.findOne({ key: 'secret:BRAVE_API_KEY' }).lean();
    expect(row.encrypted).toBe(true);
    expect(JSON.stringify(row.value)).not.toContain('BSAfirstkey');
    expect(cfg('BRAVE_API_KEY')).toBe('BSAfirstkey123456,BSAsecondkey98765');

    const list = (await api('get', '/')).body.data;
    const brave = list.find((i) => i.id === 'brave').keys[0];
    expect(brave).toMatchObject({ set: true, source: 'admin', count: 2 });
    expect(brave.preview).not.toContain('first');
    expect(brave.preview).toMatch(/^BSA••••3456, BSA••••8765$/);

    expect((await api('delete', '/BRAVE_API_KEY')).status).toBe(200);
    expect(cfg('BRAVE_API_KEY')).toBe(env.BRAVE_API_KEY);
  });

  it('rejects unknown keys', async () => {
    expect((await api('put', '/JWT_ACCESS_SECRET').send({ value: 'x' })).status).toBe(404);
  });

  it('explains failures in plain words', () => {
    expect(reasonFor(401)).toMatch(/expired|revoked/);
    expect(reasonFor(429, 'GenerateRequestsPerDayPerProjectPerModel')).toMatch(/Daily free quota/);
    expect(reasonFor(402)).toMatch(/credit/);
  });
});
