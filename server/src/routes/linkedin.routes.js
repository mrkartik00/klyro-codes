import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped } from '../utils/query.js';
import { SocialAccount } from '../models/SocialAccount.js';
import { Approval } from '../models/Approval.js';
import { Message } from '../models/Message.js';
import { SOCIAL_CHANNELS, SOCIAL_ACCOUNT_STATUSES } from '@klyro/shared/enums';
import { listAccounts, unipileConfigured } from '../integrations/unipile/index.js';
import { ingestBatch } from '../services/lead.service.js';
import { writeAudit } from '../services/audit.service.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const linkedinRouter = Router();
const scope = (req) => ({ workspaceId: req.workspaceId, createdBy: req.auth.userId });

/* ---- Connected social accounts (LinkedIn / IG / WhatsApp) ---- */
linkedinRouter.get(
  '/accounts',
  asyncHandler(async (req, res) =>
    ok(res, (await listScoped(SocialAccount, { workspaceId: req.workspaceId, query: req.query })).items),
  ),
);

linkedinRouter.post(
  '/accounts',
  validateBody(
    z.object({
      channel: z.enum(SOCIAL_CHANNELS).default('linkedin'),
      accountId: z.string().min(1),
      pullAccountId: z.string().optional(),
      displayName: z.string().optional(),
      profileUrl: z.string().optional(),
      dailyCap: z.number().int().min(1).max(100).default(20),
      sendGapMs: z.number().int().min(60000).default(300000),
      status: z.enum(SOCIAL_ACCOUNT_STATUSES).default('paused'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const doc = await SocialAccount.create({ ...scope(req), ...req.body });
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'social_account.created', entity: 'social_account', entityId: doc._id, meta: { channel: doc.channel } });
    return created(res, doc);
  }),
);

linkedinRouter.patch(
  '/accounts/:id',
  validateBody(
    z.object({
      status: z.enum(SOCIAL_ACCOUNT_STATUSES).optional(),
      dailyCap: z.number().int().min(1).max(100).optional(),
      sendGapMs: z.number().int().min(60000).optional(),
      displayName: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const doc = await SocialAccount.findOneAndUpdate({ workspaceId: req.workspaceId, _id: req.params.id }, { $set: req.body }, { new: true });
    if (!doc) throw ApiError.notFound('Account not found');
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'social_account.updated', entity: 'social_account', entityId: doc._id, meta: req.body });
    return ok(res, doc);
  }),
);

linkedinRouter.delete(
  '/accounts/:id',
  asyncHandler(async (req, res) => {
    const doc = await SocialAccount.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
    if (!doc) throw ApiError.notFound('Account not found');
    await doc.deleteOne();
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'social_account.deleted', entity: 'social_account', entityId: doc._id });
    return ok(res, { deleted: true });
  }),
);

/** Verify the Unipile key + list the connected accounts the admin can pick from. */
linkedinRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!unipileConfigured()) return ok(res, { configured: false, accounts: [] });
    const accounts = await listAccounts();
    return ok(res, { configured: true, accounts });
  }),
);

/** Import LinkedIn leads from a Sales Navigator / CSV export.
 * Accepts { rows: [{ name, linkedinUrl, headline, company, city, country, buyingSignal }] }.
 * Each row becomes a person-centric lead (deduped by profile URL) ready for a
 * LinkedIn DM step. */
linkedinRouter.post(
  '/import',
  validateBody(
    z.object({
      rows: z
        .array(
          z.object({
            name: z.string().min(1),
            linkedinUrl: z.string().url(),
            headline: z.string().optional(),
            company: z.string().optional(),
            city: z.string().optional(),
            country: z.string().optional(),
            buyingSignal: z.string().optional(),
          }),
        )
        .min(1)
        .max(500),
    }),
  ),
  asyncHandler(async (req, res) => {
    const records = req.body.rows.map((r) => ({
      name: r.company || r.name,
      linkedinUrl: r.linkedinUrl,
      contactName: r.name,
      headline: r.headline,
      contactTitle: r.headline,
      city: r.city,
      country: r.country,
      buyingSignal: r.buyingSignal,
      tags: ['linkedin', 'csv'],
    }));
    const result = await ingestBatch({ workspaceId: req.workspaceId, source: 'linkedin', reference: `csv:${Date.now()}`, records, createdBy: req.auth.userId });
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'linkedin.import', entity: 'lead', meta: { received: result.received, created: result.created } });
    return ok(res, result);
  }),
);

/** Queue summary for the LinkedIn page: ready, sent today, recent failures. */
linkedinRouter.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const workspaceId = req.workspaceId;
    const [ready, sentToday, failures] = await Promise.all([
      Approval.countDocuments({ workspaceId, status: 'approved', channel: 'linkedin' }),
      Message.countDocuments({ workspaceId, channel: 'linkedin', status: 'sent', sentAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Message.find({ workspaceId, channel: 'linkedin', status: 'failed' }).sort({ updatedAt: -1 }).limit(5).select('error updatedAt').lean(),
    ]);
    return ok(res, { ready, sentToday, failures, sendingEnabled: Boolean(env.LINKEDIN_SENDING_ENABLED) });
  }),
);
