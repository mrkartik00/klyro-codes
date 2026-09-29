import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped, getScoped } from '../utils/query.js';
import { Deal } from '../models/Deal.js';
import { Quotation } from '../models/Quotation.js';
import { moveDeal } from '../services/deal.service.js';
import { createQuotation, setQuotationStatus, reviseQuotation } from '../services/quotation.service.js';
import { sendQuotation } from '../services/billing.service.js';
import { ApiError } from '../utils/ApiError.js';

export const dealsRouter = Router();

dealsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = req.query.stage ? { stage: req.query.stage } : {};
    const result = await listScoped(Deal, { workspaceId: req.workspaceId, query: req.query, filter, sort: { updatedAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);

// Kanban board: deals grouped by stage.
dealsRouter.get(
  '/board',
  asyncHandler(async (req, res) => {
    const deals = await Deal.find({ workspaceId: req.workspaceId, deletedAt: null }).sort({ updatedAt: -1 }).lean();
    const board = {};
    for (const d of deals) (board[d.stage] ??= []).push(d);
    return ok(res, board);
  }),
);

dealsRouter.post(
  '/:id/move',
  validateBody(z.object({ to: z.string(), lostReason: z.string().optional() })),
  asyncHandler(async (req, res) =>
    ok(res, await moveDeal({ workspaceId: req.workspaceId, dealId: req.params.id, to: req.body.to, lostReason: req.body.lostReason, actorId: req.auth.userId })),
  ),
);

// Link a portal client to this deal so they can view/accept its quotations.
dealsRouter.post(
  '/:id/assign-client',
  validateBody(z.object({ clientUserId: z.string() })),
  asyncHandler(async (req, res) => {
    const deal = await Deal.findOneAndUpdate(
      { workspaceId: req.workspaceId, _id: req.params.id },
      { $set: { clientUserId: req.body.clientUserId } },
      { new: true },
    );
    if (!deal) throw ApiError.notFound('Deal not found');
    return ok(res, deal);
  }),
);

/* ---- Quotations under a deal ---- */
dealsRouter.get(
  '/:id/quotations',
  asyncHandler(async (req, res) =>
    ok(res, await Quotation.find({ workspaceId: req.workspaceId, dealId: req.params.id }).sort({ version: -1 }).lean()),
  ),
);
dealsRouter.post(
  '/:id/quotations',
  validateBody(
    z.object({
      currency: z.enum(['USD', 'GBP', 'INR']).default('USD'),
      items: z.array(z.object({ description: z.string(), quantity: z.number().int().min(1).default(1), unitAmountMinor: z.number().int().min(0) })).min(1),
      discountPercent: z.number().min(0).max(100).default(0),
      taxPercent: z.number().min(0).max(100).default(0),
      validUntil: z.coerce.date().optional(),
    }),
  ),
  asyncHandler(async (req, res) =>
    created(res, await createQuotation({ workspaceId: req.workspaceId, dealId: req.params.id, createdBy: req.auth.userId, ...req.body })),
  ),
);

export const quotationsRouter = Router();
quotationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const q = await getScoped(Quotation, { workspaceId: req.workspaceId, id: req.params.id });
    if (!q) throw ApiError.notFound('Quotation not found');
    return ok(res, q);
  }),
);
quotationsRouter.post(
  '/:id/status',
  validateBody(z.object({ to: z.enum(['sent', 'accepted', 'rejected', 'expired', 'superseded']) })),
  asyncHandler(async (req, res) =>
    ok(res, await setQuotationStatus({ workspaceId: req.workspaceId, quotationId: req.params.id, to: req.body.to, actorId: req.auth.userId })),
  ),
);
// C20 — render PDF, mark sent, email the client a view link.
quotationsRouter.post(
  '/:id/send',
  asyncHandler(async (req, res) =>
    ok(res, await sendQuotation({ workspaceId: req.workspaceId, quotationId: req.params.id, actorId: req.auth.userId })),
  ),
);
quotationsRouter.post(
  '/:id/revise',
  validateBody(z.object({ changes: z.record(z.string(), z.any()) })),
  asyncHandler(async (req, res) =>
    ok(res, await reviseQuotation({ workspaceId: req.workspaceId, quotationId: req.params.id, changes: req.body.changes, actorId: req.auth.userId })),
  ),
);
