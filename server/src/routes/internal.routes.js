import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { internalAuth } from '../middleware/internalAuth.js';
import { idempotency } from '../middleware/idempotency.js';
import { validateBody } from '../middleware/validate.js';
import { ingestBatch } from '../services/lead.service.js';
import { applyEnrichment } from '../services/enrichment.service.js';
import { claimSend, readySends, recordSendResult } from '../services/send.service.js';
import { handleReply, resolveReplyEnrollment } from '../services/reply.service.js';
import { runDueSchedules } from '../services/schedule.service.js';
import { classifyReply } from '../services/drafting.service.js';
import { dueSteps, draftStep, handleBounce } from '../services/pipeline.service.js';
import { updateScrapeProgress } from '../services/scrape.service.js';
import { sendTelegram } from '../integrations/telegram/index.js';

export const internalRouter = Router();
internalRouter.use(internalAuth);

const wsId = z.string().min(1);

internalRouter.post(
  '/leads/batch',
  idempotency('internal:leads/batch'),
  validateBody(
    z.object({
      workspaceId: wsId,
      source: z.string(),
      reference: z.string().optional(),
      records: z.array(z.record(z.string(), z.any())).max(200),
      createdBy: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await ingestBatch(req.body))),
);

internalRouter.post(
  '/leads/enrichment',
  idempotency('internal:leads/enrichment'),
  validateBody(
    z.object({
      workspaceId: wsId,
      leadId: z.string(),
      audit: z.record(z.string(), z.any()).optional(),
      email: z.string().optional(),
      emailStatus: z.enum(['valid', 'risky', 'invalid', 'unknown']).optional(),
      companyType: z.enum(['ltd', 'llp', 'plc', 'sole_trader', 'unknown']).optional(),
      timezone: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await applyEnrichment(req.body))),
);

// Approved, due steps for n8n's send loop.
internalRouter.get(
  '/sends/ready',
  asyncHandler(async (req, res) => {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return ok(res, []);
    return ok(res, await readySends({ workspaceId, limit: Math.min(Number(req.query.limit) || 20, 100) }));
  }),
);

internalRouter.post(
  '/sends/claim',
  validateBody(z.object({ workspaceId: wsId, enrollmentId: z.string(), stepOrder: z.number().int() })),
  asyncHandler(async (req, res) => ok(res, await claimSend(req.body))),
);

// H9 — scheduled social listening (n8n every 30 min). Runs in the background.
internalRouter.post(
  '/social/reddit/scan',
  validateBody(z.object({ workspaceId: wsId })),
  asyncHandler(async (req, res) => {
    // Scheduling now lives in Schedules (admin); this n8n call is just a backup tick.
    return ok(res, await runDueSchedules());
  }),
);

// A2 — steps due for drafting/sending. n8n polls this on a schedule.
internalRouter.get(
  '/steps/due',
  asyncHandler(async (req, res) => {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return ok(res, []);
    return ok(res, await dueSteps({ workspaceId, limit: Number(req.query.limit) || 50 }));
  }),
);

// A3 — draft a step and create a pending approval.
internalRouter.post(
  '/approvals',
  idempotency('internal:approvals'),
  validateBody(
    z.object({
      workspaceId: wsId,
      enrollmentId: z.string(),
      stepOrder: z.number().int(),
      tone: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await draftStep(req.body))),
);

// A5 — bounce/DSN handling.
internalRouter.post(
  '/bounces',
  idempotency('internal:bounces'),
  validateBody(
    z.object({
      workspaceId: wsId,
      providerMessageId: z.string().optional(),
      headerToken: z.string().optional(),
      contactEmail: z.string().optional(),
      dsnText: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await handleBounce(req.body))),
);

// A6 — alerts relay for n8n (Telegram).
internalRouter.post(
  '/alerts',
  validateBody(
    z.object({
      workspaceId: wsId.optional(),
      text: z.string().min(1).max(2000),
      buttons: z.array(z.object({ text: z.string(), data: z.string() })).optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await sendTelegram(req.body.text, { buttons: req.body.buttons }))),
);

// E35 — scrape job progress from n8n.
internalRouter.post(
  '/scrape/progress',
  validateBody(
    z.object({
      workspaceId: wsId,
      scrapeJobId: z.string(),
      status: z.enum(['queued', 'running', 'ingesting', 'enriched', 'failed']).optional(),
      found: z.number().int().optional(),
      ingested: z.number().int().optional(),
      error: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await updateScrapeProgress(req.body))),
);

internalRouter.post(
  '/sends/result',
  idempotency('internal:sends/result'),
  validateBody(
    z.object({
      workspaceId: wsId,
      messageId: z.string(),
      ok: z.boolean(),
      providerMessageId: z.string().optional(),
      threadId: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => ok(res, await recordSendResult(req.body))),
);

internalRouter.post(
  '/replies',
  idempotency('internal:replies'),
  validateBody(
    z.object({
      workspaceId: wsId,
      // Optional: Gmail only knows the thread, so resolve it here when absent.
      enrollmentId: z.string().optional(),
      contactEmail: z.string().optional(),
      replyText: z.string().optional(),
      replyClass: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      providerMessageId: z.string().optional(),
      threadId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const enrollmentId = req.body.enrollmentId || (await resolveReplyEnrollment(req.body));
    // Not a reply to one of our sends (newsletter, unrelated mail): ignore
    // before spending an AI call on it.
    if (!enrollmentId) return ok(res, { matched: false });
    // Classify here if n8n didn't (single source of truth for mapping).
    let replyClass = req.body.replyClass;
    if (!replyClass && req.body.replyText) {
      replyClass = (await classifyReply({ replyText: req.body.replyText })).class;
    }
    const result = await handleReply({ ...req.body, enrollmentId, replyClass: replyClass ?? 'needs_review' });
    return ok(res, result);
  }),
);
