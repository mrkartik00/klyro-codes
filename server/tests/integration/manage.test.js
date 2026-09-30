import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { Workspace } from '../../src/models/Workspace.js';
import { User } from '../../src/models/User.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { Approval } from '../../src/models/Approval.js';
import { Deal } from '../../src/models/Deal.js';
import { Quotation } from '../../src/models/Quotation.js';
import { Template } from '../../src/models/Template.js';
import { ScrapeTarget, ScrapeJob } from '../../src/models/ScrapeTarget.js';

describe('admin full control (/admin/manage, /admin/scrape)', () => {
  let app, ws, admin, token, lead;
  const api = (method, url) => request(app)[method](`/api/v1/admin${url}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = createApp();
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-manage' });
    admin = await User.create({ name: 'Admin', email: 'boss@klyro.codes', passwordHash: 'x', role: 'admin' });
    token = jwt.sign({ sub: String(admin._id), workspaceId: String(ws._id), role: 'admin', twoFactorEnabled: true }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  });
  beforeEach(async () => {
    await Promise.all([Organization, Contact, Lead, Approval, Deal, Quotation, Template, ScrapeTarget, ScrapeJob].map((M) => M.deleteMany({})));
    const org = await Organization.create({ workspaceId: ws._id, name: 'Acme' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email: 'a@acme.com' });
    lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id });
    await Approval.create({ workspaceId: ws._id, leadId: lead._id, stepOrder: 1, channel: 'email', status: 'pending', draft: { subject: 'Hi', body: 'Hello' } });
  });

  it('edits a lead with its organization and contact', async () => {
    const res = await api('patch', `/manage/leads/${lead._id}`).send({
      stage: 'qualified',
      organization: { name: 'Acme Plumbing', domain: 'https://www.acme.com/about' },
      contact: { name: 'Jo', phone: '+15125550100' },
    });
    expect(res.status).toBe(200);
    const org = await Organization.findById(lead.organizationId).lean();
    expect(org).toMatchObject({ name: 'Acme Plumbing', domain: 'acme.com' });
    expect(await Contact.findById(lead.primaryContactId).lean()).toMatchObject({ name: 'Jo', phone: '+15125550100' });
  });

  it('deleting a lead soft-deletes it and rejects its pending drafts', async () => {
    expect((await api('delete', `/manage/leads/${lead._id}`)).status).toBe(200);
    expect((await Lead.findById(lead._id).lean()).deletedAt).toBeTruthy();
    expect((await Approval.findOne({ leadId: lead._id }).lean()).status).toBe('rejected');
  });

  it('edits a pending draft', async () => {
    const a = await Approval.findOne({ leadId: lead._id });
    const res = await api('patch', `/manage/approvals/${a._id}`).send({ body: 'Edited body' });
    expect(res.status).toBe(200);
    expect((await Approval.findById(a._id).lean()).draft.body).toBe('Edited body');
  });

  it('edits a draft quotation and recomputes the total; blocks deleting accepted ones', async () => {
    const deal = await Deal.create({ workspaceId: ws._id, title: 'Site' });
    const q = await Quotation.create({ workspaceId: ws._id, dealId: deal._id, items: [{ description: 'x', unitAmountMinor: 100 }], totalMinor: 100 });
    const res = await api('patch', `/manage/quotations/${q._id}`).send({ items: [{ description: 'Site', quantity: 2, unitAmountMinor: 50000 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.totalMinor).toBe(100000);
    await Quotation.updateOne({ _id: q._id }, { $set: { status: 'accepted' } });
    expect((await api('delete', `/manage/quotations/${q._id}`)).status).toBe(409);
  });

  it('edits and deletes a saved search, and shows a run with its leads', async () => {
    const t = await ScrapeTarget.create({ workspaceId: ws._id, name: 'Dentists', categories: ['dentist'] });
    expect((await api('patch', `/scrape/targets/${t._id}`).send({ name: 'Dentists TX', active: false })).body.data).toMatchObject({ name: 'Dentists TX', active: false });
    const job = await ScrapeJob.create({ workspaceId: ws._id, scrapeTargetId: t._id, status: 'enriched', found: 1, ingested: 1 });
    const { LeadSource } = await import('../../src/models/LeadSource.js');
    await LeadSource.create({ workspaceId: ws._id, leadId: lead._id, channel: 'maps', reference: String(job._id) });
    const detail = await api('get', `/scrape/jobs/${job._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.leads).toHaveLength(1);
    expect((await api('delete', `/scrape/targets/${t._id}`)).status).toBe(200);
    expect((await ScrapeTarget.findById(t._id).lean()).deletedAt).toBeTruthy();
  });

  it('closes runs that stopped reporting', async () => {
    const job = await ScrapeJob.create({ workspaceId: ws._id, status: 'running' });
    await ScrapeJob.collection.updateOne({ _id: job._id }, { $set: { updatedAt: new Date(Date.now() - 3600_000) } });
    await api('get', '/scrape/jobs');
    expect((await ScrapeJob.findById(job._id).lean()).status).toBe('failed');
  });
});
