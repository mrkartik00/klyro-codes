import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped, getScoped } from '../utils/query.js';
import { Lead } from '../models/Lead.js';
import { Organization } from '../models/Organization.js';

const REGEX_SPECIALS = new Set('.*+?^${}()|[]\\/'.split(''));
const escapeRegex = (str) => [...str].map((c) => (REGEX_SPECIALS.has(c) ? `\\${c}` : c)).join('');
import { Contact } from '../models/Contact.js';
import { Message } from '../models/Message.js';
import { mergeLeads } from '../services/lead.service.js';
import { ApiError } from '../utils/ApiError.js';

export const leadsRouter = Router();

// GET /leads?stage=&minScore=&tag=&source=&page=&limit=
leadsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { stage, source, tag, minScore } = req.query;
    const filter = {};
    if (stage) filter.stage = stage;
    if (source) filter.source = source;
    if (tag) filter.tags = tag;
    if (minScore) filter.score = { $gte: Number(minScore) };
    // Free-text search on the business name (case-insensitive, regex-escaped).
    if (req.query.q && String(req.query.q).trim()) {
      const rx = new RegExp(escapeRegex(String(req.query.q).trim().slice(0, 80)), 'i');
      const orgs = await Organization.find({ workspaceId: req.workspaceId, name: rx }).select('_id').limit(500).lean();
      filter.organizationId = { $in: orgs.map((o) => o._id) };
    }
    const result = await listScoped(Lead, {
      workspaceId: req.workspaceId,
      query: req.query,
      filter,
      sort: { score: -1, createdAt: -1 },
      populate: { path: 'organizationId primaryContactId' },
    });
    return ok(res, result.items, result.meta);
  }),
);

leadsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const lead = await getScoped(Lead, {
      workspaceId: req.workspaceId,
      id: req.params.id,
      populate: { path: 'organizationId primaryContactId auditId' },
    });
    if (!lead) throw ApiError.notFound('Lead not found');
    const messages = await Message.find({ workspaceId: req.workspaceId, leadId: lead._id })
      .sort({ createdAt: 1 })
      .lean();
    return ok(res, { lead, messages });
  }),
);

leadsRouter.patch(
  '/:id',
  validateBody(
    z.object({
      stage: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().max(5000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findOneAndUpdate(
      { workspaceId: req.workspaceId, _id: req.params.id },
      { $set: req.body },
      { new: true },
    );
    if (!lead) throw ApiError.notFound('Lead not found');
    return ok(res, lead);
  }),
);

leadsRouter.post(
  '/:id/merge',
  validateBody(z.object({ loserId: z.string() })),
  asyncHandler(async (req, res) => {
    const result = await mergeLeads({
      workspaceId: req.workspaceId,
      winnerId: req.params.id,
      loserId: req.body.loserId,
      actorId: req.auth.userId,
    });
    return ok(res, result);
  }),
);

// Manual single lead add.
leadsRouter.post(
  '/',
  validateBody(
    z.object({
      name: z.string().min(1),
      domain: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      country: z.string().optional(),
      category: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const org = await Organization.create({
      workspaceId: req.workspaceId,
      createdBy: req.auth.userId,
      name: req.body.name,
      domain: req.body.domain,
      country: req.body.country,
      category: req.body.category,
      phone: req.body.phone,
    });
    let contact = null;
    if (req.body.email) {
      contact = await Contact.create({
        workspaceId: req.workspaceId,
        createdBy: req.auth.userId,
        organizationId: org._id,
        email: req.body.email,
      });
    }
    const lead = await Lead.create({
      workspaceId: req.workspaceId,
      createdBy: req.auth.userId,
      organizationId: org._id,
      primaryContactId: contact?._id,
      source: 'manual',
    });
    return ok(res, lead);
  }),
);
