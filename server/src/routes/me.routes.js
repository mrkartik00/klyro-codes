import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { Quotation } from '../models/Quotation.js';
import { Project, Milestone } from '../models/Project.js';
import { Invoice } from '../models/Invoice.js';
import { acceptQuotation } from '../services/payment.service.js';
import { ApiError } from '../utils/ApiError.js';

// Client-facing portal API. Auth required; scoped to the caller's own records.
export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get(
  '/projects',
  asyncHandler(async (req, res) =>
    ok(res, await Project.find({ clientUserId: req.auth.userId, deletedAt: null }).sort({ updatedAt: -1 }).lean()),
  ),
);

meRouter.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const project = await Project.findOne({ _id: req.params.id, clientUserId: req.auth.userId });
    if (!project) throw ApiError.notFound('Project not found');
    const milestones = await Milestone.find({ projectId: project._id }).sort({ order: 1 }).lean();
    return ok(res, { project, milestones });
  }),
);

meRouter.get(
  '/quotations/:id',
  asyncHandler(async (req, res) => {
    const q = await Quotation.findById(req.params.id);
    if (!q) throw ApiError.notFound('Quotation not found');
    return ok(res, q);
  }),
);

meRouter.post(
  '/quotations/:id/accept',
  validateBody(z.object({}).optional()),
  asyncHandler(async (req, res) =>
    ok(res, await acceptQuotation({ workspaceId: (await Quotation.findById(req.params.id))?.workspaceId, quotationId: req.params.id, clientUserId: req.auth.userId, actorId: req.auth.userId })),
  ),
);

meRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const projects = await Project.find({ clientUserId: req.auth.userId }).select('_id').lean();
    const ids = projects.map((p) => p._id);
    return ok(res, await Invoice.find({ projectId: { $in: ids } }).sort({ createdAt: -1 }).lean());
  }),
);
