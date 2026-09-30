import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped, getScoped } from '../utils/query.js';
import { Campaign, SequenceStep } from '../models/Campaign.js';
import { Template } from '../models/Template.js';
import { Mailbox } from '../models/Mailbox.js';
import { Approval } from '../models/Approval.js';
import { enrollLeads } from '../services/enrollment.service.js';
import { decideApproval } from '../services/approval.service.js';
import { ApiError } from '../utils/ApiError.js';

export const outreachRouter = Router();
const scope = (req) => ({ workspaceId: req.workspaceId, createdBy: req.auth.userId });

/* ---- Mailboxes ---- */
outreachRouter.get(
  '/mailboxes',
  asyncHandler(async (req, res) => ok(res, (await listScoped(Mailbox, { workspaceId: req.workspaceId, query: req.query })).items)),
);
outreachRouter.post(
  '/mailboxes',
  validateBody(
    z.object({
      address: z.string(),
      displayName: z.string().optional(),
      provider: z.enum(['google', 'zoho', 'smtp']).default('google'),
      n8nBranchId: z.string().optional(),
      dailyCap: z.number().int().min(1).max(200).default(5),
    }),
  ),
  asyncHandler(async (req, res) => created(res, await Mailbox.create({ ...scope(req), ...req.body, warmupStartedAt: new Date() }))),
);
outreachRouter.patch(
  '/mailboxes/:id',
  validateBody(z.object({ status: z.enum(['warming', 'active', 'paused']).optional(), dailyCap: z.number().int().optional(), n8nBranchId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const mb = await Mailbox.findOneAndUpdate({ workspaceId: req.workspaceId, _id: req.params.id }, { $set: req.body }, { new: true });
    if (!mb) throw ApiError.notFound('Mailbox not found');
    return ok(res, mb);
  }),
);

/* ---- Templates ---- */
outreachRouter.get(
  '/templates',
  asyncHandler(async (req, res) => ok(res, (await listScoped(Template, { workspaceId: req.workspaceId, query: req.query })).items)),
);
outreachRouter.post(
  '/templates',
  validateBody(
    z.object({
      name: z.string(),
      channel: z.string().default('email'),
      variants: z.array(z.object({ label: z.string().optional(), subject: z.string().optional(), body: z.string(), weight: z.number().default(1) })),
      variables: z.array(z.string()).default([]),
    }),
  ),
  asyncHandler(async (req, res) => created(res, await Template.create({ ...scope(req), ...req.body }))),
);

/* ---- Campaigns + steps ---- */
outreachRouter.get(
  '/campaigns',
  asyncHandler(async (req, res) => ok(res, (await listScoped(Campaign, { workspaceId: req.workspaceId, query: req.query })).items)),
);
outreachRouter.post(
  '/campaigns',
  validateBody(z.object({ name: z.string(), channel: z.string().default('email') })),
  asyncHandler(async (req, res) => created(res, await Campaign.create({ ...scope(req), ...req.body }))),
);
outreachRouter.get(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const campaign = await getScoped(Campaign, { workspaceId: req.workspaceId, id: req.params.id });
    if (!campaign) throw ApiError.notFound('Campaign not found');
    const steps = await SequenceStep.find({ workspaceId: req.workspaceId, campaignId: campaign._id }).sort({ order: 1 }).lean();
    return ok(res, { campaign, steps });
  }),
);
outreachRouter.post(
  '/campaigns/:id/steps',
  validateBody(
    z.object({
      order: z.number().int().min(1),
      delayDays: z.number().int().min(0).default(0),
      templateId: z.string(),
      channel: z.string().default('email'),
      stopOnReply: z.boolean().default(true),
    }),
  ),
  asyncHandler(async (req, res) => created(res, await SequenceStep.create({ ...scope(req), campaignId: req.params.id, ...req.body }))),
);
outreachRouter.patch(
  '/campaigns/:id',
  validateBody(z.object({ status: z.enum(['draft', 'active', 'paused', 'archived']).optional() })),
  asyncHandler(async (req, res) => {
    const c = await Campaign.findOneAndUpdate({ workspaceId: req.workspaceId, _id: req.params.id }, { $set: req.body }, { new: true });
    if (!c) throw ApiError.notFound('Campaign not found');
    return ok(res, c);
  }),
);

/* ---- Enroll ---- */
outreachRouter.post(
  '/campaigns/:id/enroll',
  validateBody(z.object({ leadIds: z.array(z.string()).min(1).max(500) })),
  asyncHandler(async (req, res) => {
    const outcomes = await enrollLeads({
      workspaceId: req.workspaceId,
      campaignId: req.params.id,
      leadIds: req.body.leadIds,
      createdBy: req.auth.userId,
    });
    return ok(res, outcomes);
  }),
);

/* ---- Approvals ---- */
outreachRouter.get(
  '/approvals',
  asyncHandler(async (req, res) => {
    const result = await listScoped(Approval, {
      workspaceId: req.workspaceId,
      query: req.query,
      filter: { status: req.query.status ?? 'pending' },
      sort: { createdAt: 1 },
    });
    // Say who each draft is for: business name, recipient email, website.
    const leadIds = [...new Set(result.items.map((a) => String(a.leadId)).filter(Boolean))];
    const leads = await Lead.find({ workspaceId: req.workspaceId, _id: { $in: leadIds } })
      .populate('organizationId primaryContactId')
      .lean();
    const byId = Object.fromEntries(leads.map((l) => [String(l._id), l]));
    const items = result.items.map((a) => {
      const l = byId[String(a.leadId)];
      return {
        ...a,
        leadName: l?.organizationId?.name ?? null,
        to: l?.primaryContactId?.email ?? null,
        website: l?.organizationId?.domain ?? null,
        score: l?.score ?? null,
      };
    });
    return ok(res, items, result.meta);
  }),
);
outreachRouter.post(
  '/approvals/:id/decide',
  validateBody(
    z.object({
      decision: z.enum(['approve', 'reject']),
      editedDraft: z.object({ subject: z.string().optional(), body: z.string().optional() }).optional(),
    }),
  ),
  asyncHandler(async (req, res) =>
    ok(res, await decideApproval({ workspaceId: req.workspaceId, approvalId: req.params.id, ...req.body, actorId: req.auth.userId })),
  ),
);
outreachRouter.post(
  '/approvals/bulk',
  validateBody(z.object({ ids: z.array(z.string()).min(1), decision: z.enum(['approve', 'reject']) })),
  asyncHandler(async (req, res) => {
    const results = [];
    for (const id of req.body.ids) {
      results.push(await decideApproval({ workspaceId: req.workspaceId, approvalId: id, decision: req.body.decision, actorId: req.auth.userId }));
    }
    return ok(res, results);
  }),
);
