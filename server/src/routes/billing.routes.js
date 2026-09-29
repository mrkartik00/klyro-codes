import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped } from '../utils/query.js';
import { Invoice } from '../models/Invoice.js';
import { Payment } from '../models/Payment.js';
import { Project, Milestone } from '../models/Project.js';
import { sendInvoice, markInvoicePaid } from '../services/billing.service.js';
import { approveMilestone } from '../services/delivery.service.js';
import { createAgreement, signAgreement } from '../services/agreement.service.js';
import { ApiError } from '../utils/ApiError.js';

export const billingRouter = Router();

/* ---- Invoices ---- */
billingRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const result = await listScoped(Invoice, { workspaceId: req.workspaceId, query: req.query, filter, sort: { createdAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);
billingRouter.post(
  '/invoices/:id/send',
  asyncHandler(async (req, res) =>
    ok(res, await sendInvoice({ workspaceId: req.workspaceId, invoiceId: req.params.id, actorId: req.auth.userId })),
  ),
);
billingRouter.post(
  '/invoices/:id/mark-paid',
  validateBody(z.object({ amountMinor: z.number().int().positive().optional(), proofUrl: z.string().optional() })),
  asyncHandler(async (req, res) =>
    ok(res, await markInvoicePaid({ workspaceId: req.workspaceId, invoiceId: req.params.id, ...req.body, actorId: req.auth.userId })),
  ),
);

/* ---- Payments ---- */
billingRouter.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const result = await listScoped(Payment, { workspaceId: req.workspaceId, query: req.query, sort: { createdAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);

/* ---- Projects & milestones (delivery) ---- */
billingRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const result = await listScoped(Project, { workspaceId: req.workspaceId, query: req.query, sort: { updatedAt: -1 } });
    return ok(res, result.items, result.meta);
  }),
);
billingRouter.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const project = await Project.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
    if (!project) throw ApiError.notFound('Project not found');
    const milestones = await Milestone.find({ workspaceId: req.workspaceId, projectId: project._id }).sort({ order: 1 }).lean();
    return ok(res, { project, milestones });
  }),
);
billingRouter.post(
  '/milestones/:id/approve',
  asyncHandler(async (req, res) =>
    ok(res, await approveMilestone({ workspaceId: req.workspaceId, milestoneId: req.params.id, actorId: req.auth.userId })),
  ),
);

/* ---- Agreements (e-sign) ---- */
billingRouter.post(
  '/agreements',
  validateBody(z.object({ projectId: z.string(), dealId: z.string().optional() })),
  asyncHandler(async (req, res) =>
    created(res, await createAgreement({ workspaceId: req.workspaceId, ...req.body, actorId: req.auth.userId })),
  ),
);
billingRouter.post(
  '/agreements/:id/sign',
  validateBody(z.object({ signedBy: z.string().min(1) })),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await signAgreement({
        workspaceId: req.workspaceId,
        agreementId: req.params.id,
        signedBy: req.body.signedBy,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        actorId: req.auth.userId,
      }),
    ),
  ),
);

export { created };
