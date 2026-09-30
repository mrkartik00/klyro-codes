import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped } from '../utils/query.js';
import { PortfolioItem } from '../models/PortfolioItem.js';
import { Setting } from '../models/Setting.js';
import { AuditLog } from '../models/AuditLog.js';
import { ScrapeTarget } from '../models/ScrapeTarget.js';
import { ScrapeJob } from '../models/ScrapeTarget.js';
import { Organization } from '../models/Organization.js';
import { Enrollment } from '../models/Enrollment.js';
import { startScrapeJob, importLeadsCsv } from '../services/scrape.service.js';
import { startRedditJob } from '../services/social.service.js';
import { listWorkflows, setWorkflowActive, listExecutions, triggerWorkflow } from '../integrations/n8n/index.js';
import { encrypt } from '../utils/crypto.js';
import { writeAudit } from '../services/audit.service.js';
import { withTransaction } from '../utils/transaction.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { Mailbox } from '../models/Mailbox.js';
import { sendTelegram } from '../integrations/telegram/index.js';
import { generateJson } from '../integrations/gemini/index.js';
import { sendTransactional } from '../integrations/brevo/index.js';

const scope = (req) => ({ workspaceId: req.workspaceId, createdBy: req.auth.userId });

/* ---- Portfolio ---- */
export const portfolioRouter = Router();
portfolioRouter.get(
  '/',
  asyncHandler(async (req, res) => ok(res, (await listScoped(PortfolioItem, { workspaceId: req.workspaceId, query: req.query, sort: { order: 1 } })).items)),
);
portfolioRouter.post(
  '/',
  validateBody(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      url: z.string().optional(),
      imageUrl: z.string().optional(),
      tags: z.array(z.string()).default([]),
      industries: z.array(z.string()).default([]),
      featured: z.boolean().default(false),
      order: z.number().default(0),
    }),
  ),
  asyncHandler(async (req, res) => created(res, await PortfolioItem.create({ ...scope(req), ...req.body }))),
);
portfolioRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await PortfolioItem.findOneAndUpdate({ workspaceId: req.workspaceId, _id: req.params.id }, { $set: req.body }, { new: true });
    if (!item) throw ApiError.notFound('Item not found');
    return ok(res, item);
  }),
);
portfolioRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await PortfolioItem.updateOne({ workspaceId: req.workspaceId, _id: req.params.id }, { $set: { deletedAt: new Date() } });
    return ok(res, { deleted: true });
  }),
);

/* ---- Scrape targets ---- */
export const scrapeRouter = Router();
scrapeRouter.get(
  '/targets',
  asyncHandler(async (req, res) => ok(res, (await listScoped(ScrapeTarget, { workspaceId: req.workspaceId, query: req.query })).items)),
);
scrapeRouter.post(
  '/targets',
  validateBody(
    z.object({
      name: z.string().trim().min(1),
      source: z.enum(['maps', 'reddit']).default('maps'),
      communities: z.array(z.string()).default([]),
      country: z.string().default('US'),
      cities: z.array(z.string()).default([]),
      categories: z.array(z.string()).default([]),
      keywords: z.array(z.string()).default([]),
      radiusKm: z.number().default(10),
      filters: z.record(z.string(), z.any()).default({}),
      maxResults: z.number().int().default(200),
      schedule: z.enum(['once', 'daily', 'weekly']).default('once'),
    }),
  ),
  asyncHandler(async (req, res) => created(res, await ScrapeTarget.create({ ...scope(req), ...req.body }))),
);

// E35 — start a scrape run + list jobs.
scrapeRouter.post(
  '/targets/:id/run',
  asyncHandler(async (req, res) => {
    const target = await ScrapeTarget.findOne({ workspaceId: req.workspaceId, _id: req.params.id }).lean();
    if (!target) throw ApiError.notFound('Lead source not found');
    const args = { workspaceId: req.workspaceId, scrapeTargetId: req.params.id, createdBy: req.auth.userId };
    return created(res, target.source === 'reddit' ? await startRedditJob(args) : await startScrapeJob(args));
  }),
);
// Pause/resume a saved search (scheduled Reddit scans skip inactive ones).
scrapeRouter.patch(
  '/targets/:id',
  validateBody(z.object({ active: z.boolean().optional(), name: z.string().trim().min(1).optional() })),
  asyncHandler(async (req, res) => {
    const t = await ScrapeTarget.findOneAndUpdate({ workspaceId: req.workspaceId, _id: req.params.id }, { $set: req.body }, { new: true });
    if (!t) throw ApiError.notFound('Lead source not found');
    return ok(res, t);
  }),
);
scrapeRouter.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const result = await listScoped(ScrapeJob, { workspaceId: req.workspaceId, query: req.query, sort: { createdAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);

// E38 — CSV lead import (raw CSV text in the body).
scrapeRouter.post(
  '/import-csv',
  validateBody(z.object({ csv: z.string().min(1) })),
  asyncHandler(async (req, res) =>
    ok(res, await importLeadsCsv({ workspaceId: req.workspaceId, csv: req.body.csv, createdBy: req.auth.userId })),
  ),
);

/* ---- E39: Organizations ---- */
export const organizationsRouter = Router();
organizationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listScoped(Organization, { workspaceId: req.workspaceId, query: req.query, sort: { createdAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);
organizationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const org = await Organization.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
    if (!org) throw ApiError.notFound('Organization not found');
    return ok(res, org);
  }),
);

/* ---- E39: Enrollments (list) ---- */
export const enrollmentsRouter = Router();
enrollmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.campaignId) filter.campaignId = req.query.campaignId;
    const result = await listScoped(Enrollment, { workspaceId: req.workspaceId, query: req.query, filter, sort: { updatedAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);

/* ---- E39: Automation panel (n8n proxy) ---- */
export const automationRouter = Router();
automationRouter.get(
  '/workflows',
  asyncHandler(async (_req, res) => ok(res, await listWorkflows())),
);
automationRouter.post(
  '/workflows/:id/active',
  validateBody(z.object({ active: z.boolean() })),
  asyncHandler(async (req, res) => ok(res, await setWorkflowActive(req.params.id, req.body.active))),
);
automationRouter.get(
  '/executions',
  asyncHandler(async (req, res) => ok(res, await listExecutions(req.query.workflowId))),
);
automationRouter.post(
  '/trigger/:path',
  asyncHandler(async (req, res) => ok(res, await triggerWorkflow(req.params.path, req.body ?? {}))),
);

/* ---- Settings (secrets encrypted, never returned raw) ---- */
export const settingsRouter = Router();
settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await Setting.find({ workspaceId: req.workspaceId }).lean();
    // Mask secret values.
    const out = rows.map((r) => ({ key: r.key, value: r.encrypted ? '••••••' : r.value, encrypted: r.encrypted }));
    return ok(res, out);
  }),
);
settingsRouter.put(
  '/:key',
  validateBody(z.object({ value: z.any(), encrypted: z.boolean().default(false) })),
  asyncHandler(async (req, res) => {
    const value = req.body.encrypted ? encrypt(String(req.body.value)) : req.body.value;
    await withTransaction(async (session) => {
      await Setting.findOneAndUpdate(
        { workspaceId: req.workspaceId, key: req.params.key },
        { $set: { value, encrypted: req.body.encrypted, createdBy: req.auth.userId } },
        { upsert: true, session },
      );
      await writeAudit(
        { workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'setting.update', entity: 'setting', meta: { key: req.params.key } },
        session,
      );
    });
    return ok(res, { key: req.params.key, saved: true });
  }),
);

/* ---- Integrations: live status + one-click tests (admin → Settings) ---- */
async function probe(url, init) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

settingsRouter.get(
  '/integrations',
  asyncHandler(async (req, res) => {
    const [workflows, scraper, mailboxes] = await Promise.all([
      listWorkflows().catch(() => []),
      probe('http://127.0.0.1:8090/api/v1/jobs'),
      Mailbox.find({ workspaceId: req.workspaceId }).select('address status dailyCap sentToday').lean(),
    ]);
    const on = (name) => workflows.some((w) => w.active && w.name.startsWith(name));
    return ok(res, [
      { key: 'gmail', name: 'Gmail sending (n8n)', ok: on('H3') && mailboxes.some((m) => m.status === 'active'), detail: mailboxes.map((m) => `${m.address} · ${m.status} · ${m.sentToday}/${m.dailyCap} today`).join(', ') || 'No mailbox added' },
      { key: 'replies', name: 'Reply tracking (n8n)', ok: on('H4'), detail: on('H4') ? 'Checks the inbox every 2 minutes' : 'Reply watcher is off' },
      { key: 'gemini', name: 'Gemini AI drafting', ok: Boolean(env.GEMINI_API_KEY), detail: env.GEMINI_API_KEY ? `Model ${env.GEMINI_MODEL || 'gemini-flash-latest'}` : 'GEMINI_API_KEY not set — templates are used instead', test: Boolean(env.GEMINI_API_KEY) },
      { key: 'telegram', name: 'Telegram alerts', ok: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), detail: env.TELEGRAM_CHAT_ID ? `Chat ${env.TELEGRAM_CHAT_ID}` : 'Not configured', test: Boolean(env.TELEGRAM_BOT_TOKEN) },
      { key: 'brevo', name: 'Brevo (client emails: codes, quotes, invoices)', ok: Boolean(env.BREVO_API_KEY), detail: env.BREVO_API_KEY ? 'Sends from noreply@klyro.codes' : 'Not configured', test: Boolean(env.BREVO_API_KEY) },
      { key: 'n8n', name: 'n8n automation', ok: workflows.length > 0, detail: `${workflows.filter((w) => w.active).length} of ${workflows.length} workflows on` },
      { key: 'scraper', name: 'Google Maps scraper', ok: scraper, detail: scraper ? 'Running' : 'Not reachable' },
    ]);
  }),
);

settingsRouter.post(
  '/integrations/:key/test',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (key === 'telegram') {
      await sendTelegram('✅ Test from Klyro admin: Telegram alerts work.');
      return ok(res, { ok: true, message: 'Test message sent — check Telegram.' });
    }
    if (key === 'gemini') {
      const r = await generateJson('Return JSON {"ok": true}');
      if (!r?.ok) throw ApiError.badRequest('Gemini did not answer (busy or key invalid). Try again in a minute.');
      return ok(res, { ok: true, message: 'Gemini answered.' });
    }
    if (key === 'brevo') {
      const me = req.auth.email || (await (await import('../models/User.js')).User.findById(req.auth.userId).lean())?.email;
      await sendTransactional({ to: me, subject: 'Klyro test email', htmlContent: '<p>Brevo transactional email works.</p>' });
      return ok(res, { ok: true, message: `Test email sent to ${me}.` });
    }
    throw ApiError.badRequest('This integration has no test');
  }),
);

/* ---- Audit log viewer ---- */
export const auditRouter = Router();
auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listScoped(AuditLog, { workspaceId: req.workspaceId, query: req.query, sort: { createdAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);
