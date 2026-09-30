// Live end-to-end check of every Klyro feature against the running API.
//
//   cd /var/www/klyro/server && node --env-file=.env scripts/e2e-live.mjs
//
// Creates a throwaway workspace + admin (2FA) + client, walks every role's
// flows over HTTP, prints a pass/fail table, then deletes everything it made.
// Never touches real workspaces except the public-form rows it creates, which
// are tagged with the run id and removed at the end.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { authenticator } from 'otplib';

const API = process.env.E2E_API || `http://127.0.0.1:${process.env.PORT || 4100}/api/v1`;
const RUN = `e2e${Date.now().toString(36)}`;
const PW = `E2e-${crypto.randomBytes(6).toString('hex')}!`;

await mongoose.connect(process.env.MONGODB_URI);
const { sign } = await import('../src/utils/hmac.js');
const { hashPassword } = await import('../src/services/auth.service.js');
const { makeToken } = await import('../src/utils/publicToken.js');
const M = {
  Workspace: (await import('../src/models/Workspace.js')).Workspace,
  User: (await import('../src/models/User.js')).User,
  Membership: (await import('../src/models/Membership.js')).Membership,
};
const db = mongoose.connection.db;

// ---------- tiny harness ----------
const results = [];
const state = {};
async function step(area, name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ area, name, ok: true, ms: Date.now() - t, note: note ?? '' });
  } catch (err) {
    results.push({ area, name, ok: false, ms: Date.now() - t, note: String(err.message || err).slice(0, 220) });
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function http(method, path, { token, body, headers = {}, raw = false } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  if (raw) return res;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, data: json?.data };
}
async function ok(method, path, opts, expectStatus = 200) {
  const r = await http(method, path, opts);
  if (r.status !== expectStatus && !(expectStatus === 200 && r.status === 201)) {
    throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.json?.error || r.json).slice(0, 180)}`);
  }
  return r.data ?? r.json;
}
async function internal(method, path, body) {
  const raw = JSON.stringify(body ?? {});
  const ts = String(Date.now());
  const r = await fetch(API + '/internal' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-klyro-timestamp': ts,
      'x-klyro-signature': sign(ts, raw),
      'idempotency-key': crypto.randomUUID(),
    },
    body: method === 'GET' ? undefined : raw,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`internal ${method} ${path} → ${r.status} ${JSON.stringify(json?.error || json).slice(0, 180)}`);
  return json.data ?? json;
}

// ---------- fixtures ----------
const ws = await M.Workspace.create({ name: `E2E ${RUN}`, slug: RUN });
const WS = String(ws._id);
const admin = await M.User.create({
  name: 'E2E Admin',
  email: `${RUN}-admin@klyro.test`,
  passwordHash: await hashPassword(PW),
  emailVerifiedAt: new Date(),
});
await M.Membership.create({ workspaceId: ws._id, userId: admin._id, role: 'super_admin' });
const client = await M.User.create({
  name: 'E2E Client',
  email: `${RUN}-client@klyro.test`,
  passwordHash: await hashPassword(PW),
  emailVerifiedAt: new Date(),
});
await M.Membership.create({ workspaceId: ws._id, userId: client._id, role: 'client' });

try {
  // =========================================================== AUTH
  await step('auth', 'health endpoints', async () => {
    const r = await http('GET', '/health');
    expect(r.status === 200, `health ${r.status}`);
    return JSON.stringify(r.json).slice(0, 80);
  });
  await step('auth', 'wrong password rejected (401)', async () => {
    const r = await http('POST', '/auth/login', { body: { email: admin.email, password: 'nope-nope-nope' } });
    expect(r.status === 401, `got ${r.status}`);
  });
  await step('auth', 'admin without 2FA gets TOTP_SETUP_REQUIRED on admin API', async () => {
    const d = await ok('POST', '/auth/login', { body: { email: admin.email, password: PW } });
    const r = await http('GET', '/admin/leads', { token: d.accessToken });
    expect(r.status === 403 && r.json?.error?.code === 'TOTP_SETUP_REQUIRED', `got ${r.status} ${r.json?.error?.code}`);
    state.pre2faToken = d.accessToken;
  });
  await step('auth', '2FA setup + confirm via API', async () => {
    const s = await ok('POST', '/auth/2fa/setup', { token: state.pre2faToken });
    state.totpSecret = s.secret || new URL(s.otpauth).searchParams.get('secret');
    expect(state.totpSecret, 'no secret returned');
    await ok('POST', '/auth/2fa/confirm', { token: state.pre2faToken, body: { token: authenticator.generate(state.totpSecret) } });
  });
  await step('auth', 'admin login requires + accepts TOTP', async () => {
    const r = await http('POST', '/auth/login', { body: { email: admin.email, password: PW } });
    expect(r.status === 401, `expected 2FA required, got ${r.status}`);
    const d = await ok('POST', '/auth/login', {
      body: { email: admin.email, password: PW, totp: authenticator.generate(state.totpSecret) },
    });
    state.admin = d.accessToken;
    state.adminRefresh = d.refreshToken;
  });
  await step('auth', '/auth/me (admin)', async () => {
    const d = await ok('GET', '/auth/me', { token: state.admin });
    const role = d.role || d.membership?.role || d.user?.role;
    return `role=${role}`;
  });
  await step('auth', 'refresh token rotation', async () => {
    if (!state.adminRefresh) return 'no refresh token in body (cookie-based?)';
    const d = await ok('POST', '/auth/refresh', { body: { refreshToken: state.adminRefresh } });
    expect(d.accessToken, 'no new access token');
    state.admin = d.accessToken;
  });
  await step('auth', 'client login', async () => {
    const d = await ok('POST', '/auth/login', { body: { email: client.email, password: PW } });
    state.client = d.accessToken;
  });
  await step('auth', 'client blocked from admin API (403)', async () => {
    const r = await http('GET', '/admin/leads', { token: state.client });
    expect(r.status === 403, `got ${r.status}`);
  });
  await step('auth', 'register validation (short password → 400)', async () => {
    const r = await http('POST', '/auth/register', { body: { name: 'X', email: `${RUN}-r@klyro.test`, password: 'short' } });
    expect(r.status === 400, `got ${r.status}`);
  });
  await step('auth', 'forgot password always 200 (no enumeration)', async () => {
    await ok('POST', '/auth/forgot', { body: { email: `${RUN}-nobody@klyro.test` } });
  });

  const A = () => ({ token: state.admin });

  // =========================================================== LEADS
  await step('leads', 'create lead (manual)', async () => {
    const d = await ok('POST', '/admin/leads', A(), 200).catch(() => null);
    const r = await ok('POST', '/admin/leads', {
      ...A(),
      body: { name: `${RUN} Plumbing`, domain: 'example-plumbing.com', email: `${RUN}-owner@example.com`, country: 'US', category: 'plumber' },
    });
    state.leadId = String(r.leadId || r._id || r.id || r.lead?._id);
    expect(state.leadId && state.leadId !== 'undefined', `no lead id in ${JSON.stringify(r).slice(0, 120)}`);
    return d ? '' : '';
  });
  await step('leads', 'list + search leads', async () => {
    const d = await ok('GET', `/admin/leads?q=${encodeURIComponent(RUN)}`, A());
    const items = d.items || d.leads || d;
    expect(Array.isArray(items), 'not a list');
    return `${items.length} found`;
  });
  await step('leads', 'lead detail', async () => {
    const d = await ok('GET', `/admin/leads/${state.leadId}`, A());
    return Object.keys(d).slice(0, 8).join(',');
  });
  await step('leads', 'update stage/tags/notes', async () => {
    await ok('PATCH', `/admin/leads/${state.leadId}`, { ...A(), body: { tags: ['e2e'], notes: 'checked by e2e' } });
  });
  await step('leads', 'CSV import', async () => {
    const csv = `name,website,email,phone,city,country,category\n${RUN} Dental,${RUN}-dental.com,hello@${RUN}-dental.com,+15125550100,Austin,US,dentist\n`;
    const d = await ok('POST', '/admin/scrape/import-csv', { ...A(), body: { csv } });
    state.csvLeadId = String(d.leadIds?.[0] || '');
    return JSON.stringify({ received: d.received, created: d.created });
  });
  await step('leads', 'merge two leads', async () => {
    const r = await ok('POST', '/admin/leads', { ...A(), body: { name: `${RUN} Dup`, country: 'US' } });
    const dupId = String(r.leadId || r._id || r.id || r.lead?._id);
    await ok('POST', `/admin/leads/${state.csvLeadId}/merge`, { ...A(), body: { loserId: dupId } });
  });
  await step('leads', 'organizations list + detail', async () => {
    const d = await ok('GET', '/admin/organizations', A());
    const items = d.items || d;
    expect(Array.isArray(items) && items.length, 'no orgs');
    await ok('GET', `/admin/organizations/${items[0]._id}`, A());
  });

  // =========================================================== SCRAPE
  await step('scrape', 'create target + list', async () => {
    const t = await ok('POST', '/admin/scrape/targets', {
      ...A(),
      body: { name: `${RUN} target`, country: 'US', cities: ['Austin'], categories: ['dentist'], maxResults: 5 },
    });
    state.targetId = String(t._id || t.id);
    const list = await ok('GET', '/admin/scrape/targets', A());
    expect((list.items || list).some((x) => String(x._id) === state.targetId), 'target not listed');
  });
  await step('scrape', 'jobs list', async () => {
    const d = await ok('GET', '/admin/scrape/jobs', A());
    expect(Array.isArray(d.items || d), 'not a list');
  });

  // =========================================================== OUTREACH
  await step('outreach', 'mailbox create/list/patch', async () => {
    const mb = await ok('POST', '/admin/outreach/mailboxes', { ...A(), body: { address: `${RUN}@klyro.test`, dailyCap: 5 } });
    state.mailboxId = String(mb._id || mb.id);
    await ok('PATCH', `/admin/outreach/mailboxes/${state.mailboxId}`, { ...A(), body: { status: 'active' } });
    const list = await ok('GET', '/admin/outreach/mailboxes', A());
    expect((list.items || list).length >= 1, 'no mailboxes');
  });
  await step('outreach', 'template create/list', async () => {
    const t = await ok('POST', '/admin/outreach/templates', {
      ...A(),
      body: { name: `${RUN} tpl`, variants: [{ subject: 'Quick idea for {{company}}', body: 'Hi {{firstName}}, noticed {{company}}…' }] },
    });
    state.templateId = String(t._id || t.id);
    await ok('GET', '/admin/outreach/templates', A());
  });
  await step('outreach', 'campaign create + step + activate', async () => {
    const c = await ok('POST', '/admin/outreach/campaigns', { ...A(), body: { name: `${RUN} campaign` } });
    state.campaignId = String(c._id || c.id);
    await ok('POST', `/admin/outreach/campaigns/${state.campaignId}/steps`, {
      ...A(),
      body: { order: 1, delayDays: 0, templateId: state.templateId },
    });
    await ok('PATCH', `/admin/outreach/campaigns/${state.campaignId}`, { ...A(), body: { status: 'active' } });
    const d = await ok('GET', `/admin/outreach/campaigns/${state.campaignId}`, A());
    return `steps=${(d.steps || d.campaign?.steps || []).length}`;
  });
  await step('outreach', 'enroll lead (creates pitch page)', async () => {
    const d = await ok('POST', `/admin/outreach/campaigns/${state.campaignId}/enroll`, { ...A(), body: { leadIds: [state.leadId] } });
    const list = await ok('GET', `/admin/enrollments?campaignId=${state.campaignId}`, A());
    const items = list.items || list;
    state.enrollmentId = String(items[0]?._id || '');
    expect(state.enrollmentId, `no enrollment (${JSON.stringify(d).slice(0, 120)})`);
    const pitch = await db.collection('pitchpages').findOne({ workspaceId: ws._id });
    state.pitchSlug = pitch?.slug;
    state.pitchToken = pitch?.token;
    return `pitch=${state.pitchSlug || 'none'}`;
  });
  await step('outreach', 'n8n: due steps → draft (Gemini/template) → approval', async () => {
    // Make the enrollment due now in case the lead timezone pushed it out.
    await db.collection('enrollments').updateOne({ _id: new mongoose.Types.ObjectId(state.enrollmentId) }, { $set: { nextDueAt: new Date(Date.now() - 1000) } });
    const due = await internal('GET', `/steps/due?workspaceId=${WS}&limit=10`);
    expect(due.some((r) => String(r.enrollmentId) === state.enrollmentId), `enrollment not due (${due.length} due)`);
    const r = await internal('POST', '/approvals', { workspaceId: WS, enrollmentId: state.enrollmentId, stepOrder: 1 });
    return JSON.stringify(r).slice(0, 120);
  });
  await step('outreach', 'approvals list shows draft with subject/body', async () => {
    const d = await ok('GET', '/admin/outreach/approvals', A());
    const items = d.items || d;
    const a = items.find((x) => String(x.enrollmentId) === state.enrollmentId || String(x.enrollmentId?._id) === state.enrollmentId);
    expect(a, 'approval not listed');
    state.approvalId = String(a._id);
    expect(a.draft?.subject && a.draft?.body, `draft empty: ${JSON.stringify(a.draft).slice(0, 120)}`);
    return `subject="${a.draft.subject.slice(0, 50)}"`;
  });
  await step('outreach', 'approve with edits', async () => {
    await ok('POST', `/admin/outreach/approvals/${state.approvalId}/decide`, {
      ...A(),
      body: { decision: 'approve', editedDraft: { subject: 'Edited subject', body: 'Edited body' } },
    });
  });
  await step('outreach', 'n8n: ready sends → claim returns approved content', async () => {
    await db.collection('campaigns').updateOne(
      { _id: new mongoose.Types.ObjectId(state.campaignId) },
      { $set: { sendWindow: { startHour: 0, endHour: 24, businessDaysOnly: false } } },
    );
    await db.collection('mailboxes').updateOne({ _id: new mongoose.Types.ObjectId(state.mailboxId) }, { $set: { lastSentAt: new Date(Date.now() - 3600e3) } });
    const ready = await internal('GET', `/sends/ready?workspaceId=${WS}`);
    expect(ready.some((r) => r.enrollmentId === state.enrollmentId), 'not ready');
    const c = await internal('POST', '/sends/claim', { workspaceId: WS, enrollmentId: state.enrollmentId, stepOrder: 1 });
    expect(c.claimed, `not claimed: ${c.reason}`);
    expect(c.subject === 'Edited subject' && c.body === 'Edited body', 'claim lost the edits');
    expect(/\/public\/u\//.test(c.unsubscribeUrl || ''), 'no unsubscribe url');
    state.claim = c;
  });
  await step('outreach', 'n8n: send result recorded', async () => {
    await internal('POST', '/sends/result', {
      workspaceId: WS,
      messageId: String(state.claim.messageId),
      ok: true,
      providerMessageId: `${RUN}-msg`,
      threadId: `${RUN}-thread`,
    });
  });
  await step('outreach', 'bulk approve endpoint', async () => {
    const r = await http('POST', '/admin/outreach/approvals/bulk', { ...A(), body: { ids: [state.approvalId], decision: 'approve' } });
    expect(r.status === 200, `got ${r.status}`);
  });

  // =========================================================== PUBLIC
  await step('public', 'pitch page meta + page + event', async () => {
    if (!state.pitchSlug) throw new Error('no pitch page was created at enrollment');
    const q = `?t=${state.pitchToken}`;
    const bad = await http('GET', `/public/pitch/${state.pitchSlug}?t=wrong`);
    expect(bad.status === 404, `wrong token should 404, got ${bad.status}`);
    await ok('GET', `/public/pitch/${state.pitchSlug}/meta${q}`);
    const p = await ok('GET', `/public/pitch/${state.pitchSlug}${q}`);
    await ok('POST', `/public/pitch/${state.pitchSlug}/events`, { body: { t: state.pitchToken, type: 'view', sessionId: RUN } });
    return `business=${p.businessName}`;
  });
  await step('public', 'unsubscribe link (GET confirm + POST one-click)', async () => {
    const tok = makeToken({ k: 'u', w: WS, e: `${RUN}-unsub@example.com` });
    const g = await http('GET', `/public/u/${tok}`);
    expect(g.status === 200, `GET ${g.status}`);
    const p = await http('POST', `/public/u/${tok}`);
    expect(p.status === 200, `POST ${p.status}`);
    const sup = await db.collection('suppressions').findOne({ workspaceId: ws._id, value: `${RUN}-unsub@example.com` });
    expect(sup, 'not suppressed');
  });
  await step('public', 'forged unsubscribe token ignored', async () => {
    const r = await http('GET', `/public/u/eyJrIjoidSJ9.forged`);
    expect(r.status === 200, `got ${r.status}`);
  });
  await step('public', 'click-tracking redirect', async () => {
    const tok = makeToken({ k: 'c', w: WS, u: 'https://klyro.codes/' });
    const r = await http('GET', `/public/t/c/${tok}`, { raw: true });
    expect([301, 302, 303, 307].includes(r.status), `got ${r.status}`);
    return r.headers.get('location');
  });
  await step('public', 'enquiry form (honeypot + real)', async () => {
    const hp = await http('POST', '/public/enquiries', {
      body: { name: 'Bot', email: `${RUN}-bot@example.com`, message: 'spam spam spam spam', website_url: 'http://x' },
    });
    expect(hp.status === 200, `honeypot ${hp.status}`);
    const r = await http('POST', '/public/enquiries', {
      body: { name: `${RUN} Visitor`, email: `${RUN}-visitor@example.com`, company: `${RUN} Co`, message: 'Need a new website for my bakery please.' },
    });
    expect(r.status === 200, `enquiry ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  });
  await step('public', 'project request form', async () => {
    const r = await http('POST', '/public/project-requests', {
      body: { name: `${RUN} Req`, email: `${RUN}-req@example.com`, projectType: 'website', budget: '$2k-5k', message: 'Online booking site for a dental clinic.' },
    });
    expect(r.status === 200, `got ${r.status} ${JSON.stringify(r.json).slice(0, 140)}`);
  });

  // =========================================================== REPLIES → DEALS
  await step('pipeline', 'n8n: reply matched by thread → interested → deal', async () => {
    const r = await internal('POST', '/replies', {
      workspaceId: WS,
      threadId: `${RUN}-thread`,
      contactEmail: `${RUN}-owner@example.com`,
      replyText: 'Yes, this sounds great. Can you send pricing? We are interested.',
      replyClass: 'interested',
      providerMessageId: `${RUN}-reply`,
    });
    expect(r.matched !== false, 'reply not matched to enrollment');
    const deal = await db.collection('deals').findOne({ workspaceId: ws._id });
    expect(deal, `no deal created (${JSON.stringify(r).slice(0, 100)})`);
    state.dealId = String(deal._id);
  });
  await step('pipeline', 'unrelated inbound mail ignored', async () => {
    const r = await internal('POST', '/replies', { workspaceId: WS, threadId: 'nope', contactEmail: 'random@nowhere.test', replyText: 'newsletter' });
    expect(r.matched === false, `expected matched:false, got ${JSON.stringify(r).slice(0, 80)}`);
  });
  await step('deals', 'deals list + kanban board', async () => {
    await ok('GET', '/admin/deals', A());
    const b = await ok('GET', '/admin/deals/board', A());
    return Object.keys(b.columns || b).slice(0, 8).join(',');
  });
  await step('deals', 'move deal stage', async () => {
    const deal = await db.collection('deals').findOne({ _id: new mongoose.Types.ObjectId(state.dealId) });
    const to = deal.stage === 'call' ? 'quote' : 'call';
    const r = await http('POST', `/admin/deals/${state.dealId}/move`, { ...A(), body: { to } });
    expect(r.status === 200, `${deal.stage}→${to}: ${r.status} ${String(JSON.stringify(r.json?.error ?? '')).slice(0, 120)}`);
    return `${deal.stage}→${to}`;
  });
  await step('deals', 'assign client user to deal', async () => {
    await ok('POST', `/admin/deals/${state.dealId}/assign-client`, { ...A(), body: { clientUserId: String(client._id) } });
  });

  // =========================================================== QUOTES
  await step('quotes', 'create quotation', async () => {
    const q = await ok('POST', `/admin/deals/${state.dealId}/quotations`, {
      ...A(),
      body: { currency: 'USD', items: [{ description: 'Website redesign', quantity: 1, unitAmountMinor: 150000 }], taxPercent: 0 },
    });
    state.quoteId = String(q._id || q.id || q.quotation?._id);
    const list = await ok('GET', `/admin/deals/${state.dealId}/quotations`, A());
    expect((list.items || list).length >= 1, 'quote not listed');
    return `total=${q.totalMinor ?? q.total?.amountMinor}`;
  });
  await step('quotes', 'revise quotation', async () => {
    const r = await ok('POST', `/admin/quotations/${state.quoteId}/revise`, { ...A(), body: { changes: { discountPercent: 10 } } });
    state.quoteId = String(r._id || r.id || r.quotation?._id || state.quoteId);
  });
  await step('quotes', 'send quotation (PDF + email)', async () => {
    const r = await http('POST', `/admin/quotations/${state.quoteId}/send`, A());
    expect(r.status === 200, `got ${r.status} ${String(JSON.stringify(r.json?.error ?? '')).slice(0, 160)}`);
    const q = await ok('GET', `/admin/quotations/${state.quoteId}`, A());
    return `status=${q.status}`;
  });
  await step('client', 'client sees quote list + detail', async () => {
    const list = await ok('GET', '/me/quotations', { token: state.client });
    expect((list.items || list).some((q) => String(q._id) === state.quoteId), 'quote not in client list');
    await ok('GET', `/me/quotations/${state.quoteId}`, { token: state.client });
  });
  await step('client', 'client cannot read another workspace quote (IDOR)', async () => {
    const r = await http('GET', `/me/quotations/${new mongoose.Types.ObjectId()}`, { token: state.client });
    expect([403, 404].includes(r.status), `got ${r.status}`);
  });
  await step('client', 'client accepts quote → project + invoice', async () => {
    await ok('POST', `/me/quotations/${state.quoteId}/accept`, { token: state.client, body: {} });
    const projects = await ok('GET', '/me/projects', { token: state.client });
    const p = (projects.items || projects)[0];
    expect(p, 'no project for client');
    state.projectId = String(p._id);
    await ok('GET', `/me/projects/${state.projectId}`, { token: state.client });
    const inv = await ok('GET', '/me/invoices', { token: state.client });
    expect((inv.items || inv).length >= 1, 'no invoice for client');
  });

  // =========================================================== BILLING
  await step('billing', 'admin invoices/payments/projects lists', async () => {
    const inv = await ok('GET', '/admin/billing/invoices', A());
    state.invoiceId = String((inv.items || inv)[0]?._id || '');
    expect(state.invoiceId, 'no invoice');
    await ok('GET', '/admin/billing/payments', A());
    await ok('GET', '/admin/billing/projects', A());
    const p = await ok('GET', `/admin/billing/projects/${state.projectId}`, A());
    state.milestoneId = String((p.milestones || p.project?.milestones || [])[0]?._id || '');
  });
  await step('billing', 'send invoice (PDF + email)', async () => {
    const r = await http('POST', `/admin/billing/invoices/${state.invoiceId}/send`, A());
    expect(r.status === 200, `got ${r.status} ${String(JSON.stringify(r.json?.error ?? '')).slice(0, 160)}`);
  });
  await step('billing', 'mark invoice paid (manual payment)', async () => {
    await ok('POST', `/admin/billing/invoices/${state.invoiceId}/mark-paid`, { ...A(), body: {} });
  });
  await step('billing', 'agreement create + sign', async () => {
    const a = await ok('POST', '/admin/billing/agreements', { ...A(), body: { projectId: state.projectId, dealId: state.dealId } });
    const id = String(a._id || a.id || a.agreement?._id);
    await ok('POST', `/admin/billing/agreements/${id}/sign`, { ...A(), body: { signedBy: 'E2E Client' } });
  });
  await step('billing', 'milestone approve', async () => {
    if (!state.milestoneId) return 'project has no milestones (skipped)';
    await ok('POST', `/admin/billing/milestones/${state.milestoneId}/approve`, { ...A(), body: {} });
  });

  // =========================================================== MESSAGING
  await step('chat', 'client conversation (auto-created) + history', async () => {
    const d = await ok('GET', '/me/conversation', { token: state.client });
    state.convoId = String(d?.conversation?._id || '');
    expect(state.convoId, `no conversation: ${String(JSON.stringify(d)).slice(0, 160)}`);
    await ok('GET', `/me/conversation/${state.convoId}/messages`, { token: state.client });
  });
  await step('chat', 'admin inbox list + reply → client sees it', async () => {
    const list = await ok('GET', '/admin/inbox/conversations', A());
    expect((list.items || list).some((c) => String(c._id) === state.convoId), 'conversation not in admin inbox');
    await ok('GET', `/admin/inbox/conversations/${state.convoId}`, A());
    await ok('POST', `/admin/inbox/conversations/${state.convoId}/messages`, { ...A(), body: { body: 'Hello from the Klyro team' } });
    const m = await ok('GET', '/me/conversation', { token: state.client });
    expect((m.messages || []).some((x) => x.body === 'Hello from the Klyro team'), 'client does not see admin reply');
  });

  // =========================================================== ADMIN MISC
  await step('admin', 'portfolio CRUD', async () => {
    const p = await ok('POST', '/admin/portfolio', { ...A(), body: { title: `${RUN} site`, url: 'https://klyro.codes' } });
    const id = String(p._id || p.id);
    await ok('PATCH', `/admin/portfolio/${id}`, { ...A(), body: { featured: true } });
    await ok('GET', '/admin/portfolio', A());
    await ok('DELETE', `/admin/portfolio/${id}`, A());
  });
  await step('admin', 'settings get/put', async () => {
    await ok('PUT', '/admin/settings/e2e_flag', { ...A(), body: { value: { on: true } } });
    const s = await ok('GET', '/admin/settings', A());
    return Object.keys(s).length + ' keys';
  });
  await step('admin', 'audit log has entries', async () => {
    const d = await ok('GET', '/admin/audit-logs', A());
    expect((d.items || d).length > 0, 'empty');
    return `${(d.items || d).length} rows`;
  });
  await step('admin', 'analytics summary + funnel', async () => {
    await ok('GET', '/admin/analytics/summary', A());
    await ok('GET', '/admin/analytics/funnel', A());
  });
  await step('admin', 'automation: n8n workflows + executions', async () => {
    const w = await ok('GET', '/admin/automation/workflows', A());
    await ok('GET', '/admin/automation/executions', A());
    return `${(w.items || w).length} workflows`;
  });
  await step('admin', 'file upload presign (Spaces)', async () => {
    const r = await http('POST', '/admin/files/presign', { ...A(), body: { name: 'a.pdf', mime: 'application/pdf', size: 1000 } });
    return `${r.status} ${JSON.stringify(r.json?.error?.message || '').slice(0, 80)}`;
  });
  await step('security', 'internal API rejects bad signature', async () => {
    const r = await fetch(API + '/internal/steps/due?workspaceId=x', { headers: { 'x-klyro-timestamp': String(Date.now()), 'x-klyro-signature': 'bad' } });
    expect(r.status === 401, `got ${r.status}`);
  });
  await step('security', 'admin API without token → 401', async () => {
    const r = await http('GET', '/admin/leads');
    expect(r.status === 401, `got ${r.status}`);
  });
} finally {
  // ---------- report ----------
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`\nE2E ${RUN}  →  ${API}\n`);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${pad(r.area, 9)} ${pad(r.name, 58)} ${pad(r.ms + 'ms', 7)} ${r.note}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed`);

  // ---------- cleanup ----------
  if (!process.env.E2E_KEEP) {
    const wsId = ws._id;
    const cols = await db.listCollections().toArray();
    for (const { name } of cols) {
      if (name.startsWith('system.')) continue;
      await db.collection(name).deleteMany({ workspaceId: wsId });
    }
    await db.collection('users').deleteMany({ email: { $regex: `^${RUN}-` } });
    await db.collection('workspaces').deleteOne({ _id: wsId });
    // Public forms land in the default workspace; remove rows tagged with this run.
    const orgs = await db.collection('organizations').find({ name: { $regex: RUN } }).toArray();
    const contacts = await db.collection('contacts').find({ email: { $regex: `^${RUN}-` } }).toArray();
    const orgIds = orgs.map((o) => o._id);
    const contactIds = contacts.map((c) => c._id);
    const leads = await db.collection('leads').find({ $or: [{ organizationId: { $in: orgIds } }, { primaryContactId: { $in: contactIds } }] }).toArray();
    const leadIds = leads.map((l) => l._id);
    await db.collection('deals').deleteMany({ $or: [{ leadId: { $in: leadIds } }, { contactId: { $in: contactIds } }] });
    await db.collection('leadsources').deleteMany({ leadId: { $in: leadIds } });
    await db.collection('leads').deleteMany({ _id: { $in: leadIds } });
    await db.collection('contacts').deleteMany({ _id: { $in: contactIds } });
    await db.collection('organizations').deleteMany({ _id: { $in: orgIds } });
    await db.collection('suppressions').deleteMany({ value: { $regex: RUN } });
    console.log('cleanup done');
  }
  await mongoose.disconnect();
  process.exit(0);
}
