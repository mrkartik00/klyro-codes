import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { Quotation } from '../models/Quotation.js';
import { Deal } from '../models/Deal.js';
import { Project, Milestone } from '../models/Project.js';
import { Invoice } from '../models/Invoice.js';
import { acceptQuotation } from '../services/payment.service.js';
import { getOrCreatePortalConversation, assertClientOwnsConversation } from '../services/conversation.service.js';
import { ChatMessage } from '../models/Conversation.js';
import { ApiError } from '../utils/ApiError.js';

// Client-facing portal API. Auth required; scoped to the caller's own records.
export const meRouter = Router();
meRouter.use(requireAuth);

/**
 * Load a quotation ONLY if it belongs to the calling client. Ownership is
 * established via the quote's deal.clientUserId, or a project created for it.
 * Prevents IDOR: a client can never read/accept another client's quote.
 */
async function loadOwnedQuotation(userId, quotationId) {
  const quote = await Quotation.findById(quotationId);
  if (!quote) throw ApiError.notFound('Quotation not found');
  const deal = await Deal.findById(quote.dealId).lean();
  const ownsViaDeal = deal && String(deal.clientUserId) === String(userId);
  const project = await Project.findOne({ quotationId: quote._id, clientUserId: userId }).lean();
  const ownsViaDealForQuote = await Project.findOne({ dealId: quote.dealId, clientUserId: userId }).lean();
  if (!ownsViaDeal && !project && !ownsViaDealForQuote) {
    throw ApiError.notFound('Quotation not found'); // 404, not 403, to avoid leaking existence
  }
  return quote;
}

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

// List quotations the caller owns (via their deals).
meRouter.get(
  '/quotations',
  asyncHandler(async (req, res) => {
    const deals = await Deal.find({ clientUserId: req.auth.userId }).select('_id').lean();
    const dealIds = deals.map((d) => d._id);
    const quotes = await Quotation.find({ dealId: { $in: dealIds }, deletedAt: null })
      .sort({ createdAt: -1 })
      .lean();
    return ok(res, quotes);
  }),
);

meRouter.get(
  '/quotations/:id',
  asyncHandler(async (req, res) => ok(res, await loadOwnedQuotation(req.auth.userId, req.params.id))),
);

meRouter.post(
  '/quotations/:id/accept',
  validateBody(z.object({}).optional()),
  asyncHandler(async (req, res) => {
    const quote = await loadOwnedQuotation(req.auth.userId, req.params.id);
    return ok(
      res,
      await acceptQuotation({
        workspaceId: quote.workspaceId,
        quotationId: quote._id,
        clientUserId: req.auth.userId,
        actorId: req.auth.userId,
      }),
    );
  }),
);

meRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const projects = await Project.find({ clientUserId: req.auth.userId }).select('_id').lean();
    const ids = projects.map((p) => p._id);
    return ok(res, await Invoice.find({ projectId: { $in: ids } }).sort({ createdAt: -1 }).lean());
  }),
);

// Portal chat: get (or lazily create) the caller's conversation + history.
meRouter.get(
  '/conversation',
  asyncHandler(async (req, res) => {
    const convo = await getOrCreatePortalConversation({
      workspaceId: req.auth.workspaceId,
      clientUserId: req.auth.userId,
      projectId: req.query.projectId ?? null,
    });
    const messages = await ChatMessage.find({ workspaceId: req.auth.workspaceId, conversationId: convo._id })
      .sort({ createdAt: 1 })
      .lean();
    return ok(res, { conversation: convo, messages });
  }),
);

meRouter.get(
  '/conversation/:id/messages',
  asyncHandler(async (req, res) => {
    await assertClientOwnsConversation({
      workspaceId: req.auth.workspaceId,
      conversationId: req.params.id,
      clientUserId: req.auth.userId,
    });
    const messages = await ChatMessage.find({ workspaceId: req.auth.workspaceId, conversationId: req.params.id })
      .sort({ createdAt: 1 })
      .lean();
    return ok(res, messages);
  }),
);
