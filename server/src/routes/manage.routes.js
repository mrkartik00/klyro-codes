// Full admin control: edit and delete for every record type the admin panel
// shows. Deletes are soft where the model supports it; every change is audited.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../services/audit.service.js';
import { computeTotal } from '../services/quotation.service.js';
import { LEAD_STAGES, DEAL_STAGES } from '@klyro/shared/enums';
import { Lead } from '../models/Lead.js';
import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { Template } from '../models/Template.js';
import { Campaign, SequenceStep } from '../models/Campaign.js';
import { Enrollment } from '../models/Enrollment.js';
import { Mailbox } from '../models/Mailbox.js';
import { Approval } from '../models/Approval.js';
import { Deal } from '../models/Deal.js';
import { Quotation } from '../models/Quotation.js';

export const manageRouter = Router();

const audit = (req, action, entity, entityId, meta) =>
  writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action, entity, entityId, meta });
const now = () => new Date();
const opt = z.string().trim().max(500).optional();
const optNullable = z.string().trim().max(500).nullable().optional();

async function findOr404(Model, req, label, extra = {}) {
  const base = { workspaceId: req.workspaceId, _id: req.params.id, ...extra };
  if (Model.schema.path('deletedAt')) base.deletedAt = null;
  const doc = await Model.findOne(base);
  if (!doc) throw ApiError.notFound(`${label} not found`);
  return doc;
}

/** Stop outreach to a lead: stop enrollments, reject pending drafts. */
async function stopOutreach(workspaceId, leadIds) {
  await Enrollment.updateMany({ workspaceId, leadId: { $in: leadIds }, status: 'active' }, { $set: { status: 'stopped', nextDueAt: null } });
  await Approval.updateMany({ workspaceId, leadId: { $in: leadIds }, status: 'pending' }, { $set: { status: 'rejected' } });
}

/* ---------------- Leads (+ their organization and main contact) ---------------- */
manageRouter.patch(
  '/leads/:id',
  validateBody(
    z.object({
      stage: z.enum(LEAD_STAGES).optional(),
      score: z.number().min(0).max(100).optional(),
      tags: z.array(z.string().trim().max(60)).max(50).optional(),
      notes: z.string().max(5000).optional(),
      organization: z
        .object({ name: opt, domain: optNullable, phone: optNullable, city: optNullable, country: optNullable, category: optNullable, address: optNullable })
        .partial()
        .optional(),
      contact: z.object({ name: optNullable, email: z.string().trim().toLowerCase().email().nullable().optional().or(z.literal('')), phone: optNullable, title: optNullable }).partial().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const lead = await findOr404(Lead, req, 'Lead');
    const { organization, contact, ...leadFields } = req.body;
    Object.assign(lead, leadFields);
    await lead.save();
    if (organization && Object.keys(organization).length) {
      if (organization.domain) organization.domain = organization.domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
      await Organization.updateOne({ workspaceId: req.workspaceId, _id: lead.organizationId }, { $set: organization });
    }
    if (contact && Object.keys(contact).length) {
      const patch = { ...contact };
      if (patch.email === '') patch.email = null;
      if (lead.primaryContactId) {
        await Contact.updateOne({ workspaceId: req.workspaceId, _id: lead.primaryContactId }, { $set: patch });
      } else {
        const c = await Contact.create({ workspaceId: req.workspaceId, organizationId: lead.organizationId, ...patch });
        lead.primaryContactId = c._id;
        await lead.save();
      }
    }
    await audit(req, 'lead.update', 'lead', lead._id, req.body);
    return ok(res, lead);
  }),
);
manageRouter.delete(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const lead = await findOr404(Lead, req, 'Lead');
    lead.deletedAt = now();
    await lead.save();
    await stopOutreach(req.workspaceId, [lead._id]);
    await audit(req, 'lead.delete', 'lead', lead._id);
    return ok(res, { deleted: true });
  }),
);
manageRouter.post(
  '/leads/bulk',
  validateBody(
    z.object({
      ids: z.array(z.string()).min(1).max(1000),
      action: z.enum(['delete', 'stage', 'tag', 'stopOutreach']),
      stage: z.enum(LEAD_STAGES).optional(),
      tag: z.string().trim().max(60).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { ids, action, stage, tag } = req.body;
    const filter = { workspaceId: req.workspaceId, _id: { $in: ids }, deletedAt: null };
    let r;
    if (action === 'delete') {
      r = await Lead.updateMany(filter, { $set: { deletedAt: now() } });
      await stopOutreach(req.workspaceId, ids);
    } else if (action === 'stage') {
      if (!stage) throw ApiError.badRequest('stage is required');
      r = await Lead.updateMany(filter, { $set: { stage } });
    } else if (action === 'tag') {
      if (!tag) throw ApiError.badRequest('tag is required');
      r = await Lead.updateMany(filter, { $addToSet: { tags: tag } });
    } else {
      await stopOutreach(req.workspaceId, ids);
      r = { modifiedCount: ids.length };
    }
    await audit(req, `lead.bulk.${action}`, 'lead', null, { count: ids.length, stage, tag });
    return ok(res, { updated: r.modifiedCount ?? 0 });
  }),
);

/* ---------------- Templates ---------------- */
const variant = z.object({ label: z.string().optional(), subject: z.string().optional(), body: z.string(), weight: z.number().default(1) });
manageRouter.patch(
  '/templates/:id',
  validateBody(z.object({ name: z.string().trim().min(1), channel: z.string(), variants: z.array(variant).min(1), variables: z.array(z.string()) }).partial()),
  asyncHandler(async (req, res) => {
    const t = await findOr404(Template, req, 'Template');
    Object.assign(t, req.body);
    await t.save();
    await audit(req, 'template.update', 'template', t._id);
    return ok(res, t);
  }),
);
manageRouter.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const t = await findOr404(Template, req, 'Template');
    const used = await SequenceStep.countDocuments({ workspaceId: req.workspaceId, templateId: t._id });
    if (used) throw ApiError.conflict(`Template is used by ${used} campaign step(s) — remove those steps first`);
    t.deletedAt = now();
    await t.save();
    await audit(req, 'template.delete', 'template', t._id);
    return ok(res, { deleted: true });
  }),
);

/* ---------------- Campaigns, steps, enrollments ---------------- */
manageRouter.patch(
  '/campaigns/:id',
  validateBody(
    z
      .object({
        name: z.string().trim().min(1),
        status: z.enum(['draft', 'active', 'paused', 'archived']),
        sendWindow: z.object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24), businessDaysOnly: z.boolean() }).partial(),
      })
      .partial(),
  ),
  asyncHandler(async (req, res) => {
    const c = await findOr404(Campaign, req, 'Campaign');
    const { sendWindow, ...rest } = req.body;
    Object.assign(c, rest);
    if (sendWindow) c.sendWindow = { ...(c.sendWindow?.toObject?.() ?? {}), ...sendWindow };
    await c.save();
    await audit(req, 'campaign.update', 'campaign', c._id, req.body);
    return ok(res, c);
  }),
);
manageRouter.delete(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const c = await findOr404(Campaign, req, 'Campaign');
    c.deletedAt = now();
    c.status = 'archived';
    await c.save();
    const enr = await Enrollment.find({ workspaceId: req.workspaceId, campaignId: c._id, status: 'active' }).select('leadId').lean();
    await Enrollment.updateMany({ workspaceId: req.workspaceId, campaignId: c._id, status: 'active' }, { $set: { status: 'stopped', nextDueAt: null } });
    await Approval.updateMany(
      { workspaceId: req.workspaceId, leadId: { $in: enr.map((e) => e.leadId) }, status: 'pending', channel: { $ne: 'reddit' } },
      { $set: { status: 'rejected' } },
    );
    await audit(req, 'campaign.delete', 'campaign', c._id, { stoppedEnrollments: enr.length });
    return ok(res, { deleted: true, stoppedEnrollments: enr.length });
  }),
);
manageRouter.patch(
  '/steps/:id',
  validateBody(z.object({ delayDays: z.number().int().min(0).max(90), templateId: z.string(), channel: z.string(), stopOnReply: z.boolean() }).partial()),
  asyncHandler(async (req, res) => {
    const s = await findOr404(SequenceStep, req, 'Step');
    Object.assign(s, req.body);
    await s.save();
    await audit(req, 'step.update', 'sequenceStep', s._id, req.body);
    return ok(res, s);
  }),
);
manageRouter.delete(
  '/steps/:id',
  asyncHandler(async (req, res) => {
    const s = await findOr404(SequenceStep, req, 'Step');
    await SequenceStep.deleteOne({ _id: s._id });
    // Close the gap so step orders stay 1..n.
    const later = await SequenceStep.find({ workspaceId: req.workspaceId, campaignId: s.campaignId, order: { $gt: s.order } }).sort({ order: 1 });
    for (const x of later) {
      x.order -= 1;
      await x.save();
    }
    await audit(req, 'step.delete', 'sequenceStep', s._id);
    return ok(res, { deleted: true });
  }),
);
manageRouter.patch(
  '/enrollments/:id',
  validateBody(z.object({ status: z.enum(['active', 'stopped']) })),
  asyncHandler(async (req, res) => {
    const e = await findOr404(Enrollment, req, 'Enrollment');
    e.status = req.body.status;
    if (req.body.status === 'stopped') e.nextDueAt = null;
    else if (!e.nextDueAt) e.nextDueAt = now();
    await e.save();
    await audit(req, 'enrollment.update', 'enrollment', e._id, req.body);
    return ok(res, e);
  }),
);

/* ---------------- Mailboxes ---------------- */
manageRouter.patch(
  '/mailboxes/:id',
  validateBody(
    z
      .object({ displayName: z.string().trim().max(120), status: z.enum(['warming', 'active', 'paused']), dailyCap: z.number().int().min(0).max(500), n8nBranchId: z.string().nullable() })
      .partial(),
  ),
  asyncHandler(async (req, res) => {
    const m = await findOr404(Mailbox, req, 'Mailbox');
    Object.assign(m, req.body);
    await m.save();
    await audit(req, 'mailbox.update', 'mailbox', m._id, req.body);
    return ok(res, m);
  }),
);
manageRouter.delete(
  '/mailboxes/:id',
  asyncHandler(async (req, res) => {
    const m = await findOr404(Mailbox, req, 'Mailbox');
    await Mailbox.deleteOne({ _id: m._id });
    await audit(req, 'mailbox.delete', 'mailbox', m._id, { address: m.address });
    return ok(res, { deleted: true });
  }),
);

/* ---------------- Approvals (drafts) ---------------- */
manageRouter.patch(
  '/approvals/:id',
  validateBody(z.object({ subject: z.string().max(300).optional(), body: z.string().min(1).max(20000).optional() })),
  asyncHandler(async (req, res) => {
    const a = await findOr404(Approval, req, 'Draft', { status: 'pending' });
    a.draft = { ...(a.draft?.toObject?.() ?? a.draft ?? {}), ...req.body };
    a.markModified('draft');
    await a.save();
    await audit(req, 'approval.edit', 'approval', a._id);
    return ok(res, a);
  }),
);
manageRouter.delete(
  '/approvals/:id',
  asyncHandler(async (req, res) => {
    const a = await findOr404(Approval, req, 'Draft');
    await Approval.deleteOne({ _id: a._id });
    await audit(req, 'approval.delete', 'approval', a._id);
    return ok(res, { deleted: true });
  }),
);

/* ---------------- Deals ---------------- */
manageRouter.patch(
  '/deals/:id',
  validateBody(
    z
      .object({
        title: z.string().trim().min(1).max(200),
        stage: z.enum(DEAL_STAGES),
        value: z.object({ amountMinor: z.number().int().min(0), currency: z.enum(['USD', 'GBP', 'INR']) }),
        lostReason: z.string().max(500),
        source: z.string().max(60),
      })
      .partial(),
  ),
  asyncHandler(async (req, res) => {
    const d = await findOr404(Deal, req, 'Deal');
    Object.assign(d, req.body);
    await d.save();
    await audit(req, 'deal.update', 'deal', d._id, req.body);
    return ok(res, d);
  }),
);
manageRouter.delete(
  '/deals/:id',
  asyncHandler(async (req, res) => {
    const d = await findOr404(Deal, req, 'Deal');
    d.deletedAt = now();
    await d.save();
    await Quotation.updateMany({ workspaceId: req.workspaceId, dealId: d._id, deletedAt: null }, { $set: { deletedAt: now() } });
    await audit(req, 'deal.delete', 'deal', d._id);
    return ok(res, { deleted: true });
  }),
);

/* ---------------- Quotations ---------------- */
const item = z.object({ description: z.string().trim().min(1), quantity: z.number().int().min(1), unitAmountMinor: z.number().int().min(0) });
manageRouter.patch(
  '/quotations/:id',
  validateBody(
    z
      .object({
        items: z.array(item).min(1),
        discountPercent: z.number().min(0).max(100),
        taxPercent: z.number().min(0).max(100),
        currency: z.enum(['USD', 'GBP', 'INR']),
        validUntil: z.coerce.date().nullable(),
      })
      .partial(),
  ),
  asyncHandler(async (req, res) => {
    const q = await findOr404(Quotation, req, 'Quotation');
    if (q.status !== 'draft') throw ApiError.conflict('Only draft quotations can be edited — use Revise for sent ones');
    Object.assign(q, req.body);
    q.totalMinor = computeTotal({ items: q.items, discountPercent: q.discountPercent, taxPercent: q.taxPercent });
    await q.save();
    await audit(req, 'quotation.update', 'quotation', q._id);
    return ok(res, q);
  }),
);
manageRouter.delete(
  '/quotations/:id',
  asyncHandler(async (req, res) => {
    const q = await findOr404(Quotation, req, 'Quotation');
    if (q.status === 'accepted') throw ApiError.conflict('Accepted quotations cannot be deleted');
    q.deletedAt = now();
    await q.save();
    await audit(req, 'quotation.delete', 'quotation', q._id);
    return ok(res, { deleted: true });
  }),
);
