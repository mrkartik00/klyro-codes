import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { Workspace } from '../../src/models/Workspace.js';
import { User } from '../../src/models/User.js';
import { ScrapeSchedule } from '../../src/models/ScrapeSchedule.js';
import { ScrapeTarget } from '../../src/models/ScrapeTarget.js';
import { cronExpressions, nextRunTime, validateFrequency, runDueSchedules, resolveTargets } from '../../src/services/schedule.service.js';

describe('schedule timing', () => {
  const from = new Date('2026-09-30T12:00:00Z'); // Wed 17:30 IST
  it('builds cron for daily/weekly/monthly', () => {
    expect(cronExpressions({ type: 'daily', times: ['03:30'] })).toEqual(['30 3 * * *']);
    expect(cronExpressions({ type: 'weekly', times: ['09:00'], days: [1, 4] })).toEqual(['0 9 * * 1,4']);
    expect(cronExpressions({ type: 'monthly', times: ['10:15'], dayOfMonth: 31 })).toEqual(['15 10 28 * *']);
  });
  it('computes the next run in the schedule timezone', () => {
    const next = nextRunTime({ frequency: { type: 'daily', times: ['03:30'] }, timezone: 'Asia/Kolkata' }, from);
    expect(next.toISOString()).toBe('2026-09-30T22:00:00.000Z'); // Thu 03:30 IST
    expect(nextRunTime({ frequency: { type: 'interval', everyMinutes: 30 } }, from).toISOString()).toBe('2026-09-30T12:30:00.000Z');
  });
  it('rejects bad input', () => {
    expect(() => validateFrequency({ type: 'cron', cron: '61 * * * *' }, 'UTC')).toThrow(/Invalid cron/);
    expect(() => validateFrequency({ type: 'daily', times: [] }, 'UTC')).toThrow(/time/);
    expect(() => validateFrequency({ type: 'interval', everyMinutes: 1 }, 'UTC')).toThrow(/5 minutes/);
    expect(() => validateFrequency({ type: 'daily', times: ['09:00'] }, 'Mars/Base')).toThrow(/timezone/);
  });
});

describe('schedules API + runner', () => {
  let app, ws, token;
  const api = (m, u) => request(app)[m](`/api/v1/admin/schedules${u}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = createApp();
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-sched' });
    const admin = await User.create({ name: 'A', email: 'sched@klyro.codes', passwordHash: 'x', role: 'admin' });
    token = jwt.sign({ sub: String(admin._id), workspaceId: String(ws._id), role: 'admin', twoFactorEnabled: true }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  });
  beforeEach(async () => {
    await Promise.all([ScrapeSchedule.deleteMany({}), ScrapeTarget.deleteMany({})]);
  });

  it('creates, previews, edits and deletes a schedule', async () => {
    await ScrapeTarget.create({ workspaceId: ws._id, name: 'Roofers', group: 'Home services', categories: ['roofer'] });
    await ScrapeTarget.create({ workspaceId: ws._id, name: 'Dentists', group: 'Health', categories: ['dentist'] });
    const body = { name: 'Home daily', frequency: { type: 'daily', times: ['03:30'] }, source: 'maps', groups: ['Home services'] };
    const prev = await api('post', '/preview').send(body);
    expect(prev.body.data).toMatchObject({ matching: 1, next: ['Roofers'] });
    expect(prev.body.data.runs).toHaveLength(5);

    const res = await api('post', '/').send(body);
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    const id = res.body.data._id;

    expect((await api('patch', `/${id}`).send({ frequency: { type: 'cron', cron: 'bad' } })).status).toBe(400);
    const upd = await api('patch', `/${id}`).send({ frequency: { type: 'interval', everyMinutes: 45 }, perRun: 2 });
    expect(upd.body.data).toMatchObject({ perRun: 2, frequency: { type: 'interval', everyMinutes: 45 } });

    expect((await api('get', '/')).body.data).toHaveLength(1);
    expect((await api('delete', `/${id}`)).status).toBe(200);
    expect((await api('get', '/')).body.data).toHaveLength(0);
  });

  it('picks the searches that ran longest ago first', async () => {
    await ScrapeTarget.create({ workspaceId: ws._id, name: 'Recent', source: 'reddit', lastRunAt: new Date() });
    await ScrapeTarget.create({ workspaceId: ws._id, name: 'Old', source: 'reddit', lastRunAt: new Date('2026-01-01') });
    await ScrapeTarget.create({ workspaceId: ws._id, name: 'Paused', source: 'reddit', active: false });
    const picked = await resolveTargets({ workspaceId: ws._id, mode: 'group', source: 'reddit', perRun: 1 });
    expect(picked.map((t) => t.name)).toEqual(['Old']);
  });

  it('fires a due schedule exactly once and moves it to the next slot', async () => {
    const s = await ScrapeSchedule.create({
      workspaceId: ws._id,
      name: 'Due',
      frequency: { type: 'interval', everyMinutes: 30 },
      source: 'reddit',
      groups: ['nothing-matches'],
      nextRunAt: new Date(Date.now() - 60000),
    });
    const [a, b] = await Promise.all([runDueSchedules(), runDueSchedules()]);
    expect(a.fired + b.fired).toBe(1);
    const after = await ScrapeSchedule.findById(s._id).lean();
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60000);
    expect(after.runCount).toBe(1);
  });
});
