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
import { encrypt } from '../utils/crypto.js';
import { writeAudit } from '../services/audit.service.js';
import { withTransaction } from '../utils/transaction.js';
import { ApiError } from '../utils/ApiError.js';

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
      name: z.string(),
      country: z.string(),
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

/* ---- Audit log viewer ---- */
export const auditRouter = Router();
auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listScoped(AuditLog, { workspaceId: req.workspaceId, query: req.query, sort: { createdAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);
