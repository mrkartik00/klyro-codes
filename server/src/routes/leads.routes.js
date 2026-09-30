import { Router } from 'express';
import { LeadSource } from '../models/LeadSource.js';
import { withTransaction } from '../utils/transaction.js';
import { parseSocialUrl } from '../utils/socialLinks.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { registrableDomain } from '../utils/normalize.js';
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
// Add a lead by hand — from a business name, or from any profile/post link
// (LinkedIn, X, Reddit, Instagram, Facebook, website). Atomic; reuses an
// existing contact with the same email instead of failing.
leadsRouter.post(
  '/',
  validateBody(
    z
      .object({
        name: z.string().trim().max(200).optional(),
        domain: z.string().trim().max(300).optional(),
        email: z.string().trim().email().max(254).optional().or(z.literal('')),
        phone: z.string().trim().max(40).optional(),
        country: z.string().trim().max(3).optional(),
        category: z.string().trim().max(100).optional(),
        contactName: z.string().trim().max(200).optional(),
        notes: z.string().max(5000).optional(),
        links: z.array(z.string().trim().max(500)).max(10).default([]),
      })
      .refine((v) => v.name || v.links.length || v.domain, { message: 'Enter a name, a website or a profile link' }),
  ),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const parsed = b.links.map(parseSocialUrl).filter(Boolean);
    const websiteLink = b.links.find((l) => !parseSocialUrl(l));
    const domain = registrableDomain(b.domain || websiteLink || '') || undefined;
    const socials = {};
    const handles = {};
    for (const p of parsed) {
      socials[p.platform] ??= p.url;
      if (p.handle) handles[p.platform] ??= p.handle;
    }
    const platform = parsed[0]?.platform ?? 'manual';
    const handle = parsed.find((p) => p.handle)?.handle;
    const name = b.name || handle || domain || 'New lead';
    const email = b.email ? b.email.toLowerCase() : null;

    const result = await withTransaction(async (session) => {
      const [org] = await Organization.create(
        [{ workspaceId: req.workspaceId, createdBy: req.auth.userId, name, domain, country: b.country, category: b.category, phone: b.phone, socials }],
        { session, ordered: true },
      );
      let contact = email ? await Contact.findOne({ workspaceId: req.workspaceId, email }).session(session) : null;
      if (contact) {
        contact.socials = { ...(contact.socials?.toObject?.() ?? contact.socials ?? {}), ...socials };
        contact.handles = { ...(contact.handles?.toObject?.() ?? contact.handles ?? {}), ...handles };
        await contact.save({ session });
      } else if (email || b.contactName || parsed.length) {
        [contact] = await Contact.create(
          [
            {
              workspaceId: req.workspaceId,
              createdBy: req.auth.userId,
              organizationId: org._id,
              email,
              name: b.contactName,
              phone: b.phone,
              socials,
              handles,
              linkedinUrl: socials.linkedin,
            },
          ],
          { session, ordered: true },
        );
      }
      const [lead] = await Lead.create(
        [
          {
            workspaceId: req.workspaceId,
            createdBy: req.auth.userId,
            organizationId: org._id,
            primaryContactId: contact?._id,
            source: platform,
            sourceUrl: parsed[0]?.url ?? (websiteLink || undefined),
            country: b.country,
            notes: b.notes,
            tags: platform !== 'manual' ? [platform] : [],
          },
        ],
        { session, ordered: true },
      );
      await LeadSource.create([{ workspaceId: req.workspaceId, leadId: lead._id, channel: platform, raw: { links: b.links } }], { session, ordered: true });
      return lead;
    });
    return created(res, { ...result.toObject(), leadId: result._id });
  }),
);
