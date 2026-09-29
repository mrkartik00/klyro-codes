import { Router } from 'express';
import { enquirySchema } from '@klyro/shared/schemas';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { getPublicPitch, recordPitchEvent } from '../services/pitch.service.js';
import { suppress } from '../services/suppression.service.js';
import { Workspace } from '../models/Workspace.js';
import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { Lead } from '../models/Lead.js';
import { LeadSource } from '../models/LeadSource.js';
import { Deal } from '../models/Deal.js';
import { withTransaction } from '../utils/transaction.js';
import { alertPositiveReply, alertPitchVisit } from '../services/alert.service.js';

export const publicRouter = Router();

// Resolve the (single-tenant) default workspace for inbound public traffic.
async function defaultWorkspace() {
  return Workspace.findOne().sort({ createdAt: 1 });
}

/* ---- Inbound enquiry → lead + deal ---- */
publicRouter.post(
  '/enquiries',
  validateBody(enquirySchema),
  asyncHandler(async (req, res) => {
    if (req.body.website_url) return ok(res, { received: true }); // honeypot: silently drop
    const ws = await defaultWorkspace();
    if (!ws) return ok(res, { received: true });
    const { name, email, company, message } = req.body;

    const result = await withTransaction(async (session) => {
      const [org] = await Organization.create([{ workspaceId: ws._id, name: company || name }], { session, ordered: true });
      const contact = await Contact.findOneAndUpdate(
        { workspaceId: ws._id, email },
        { $setOnInsert: { workspaceId: ws._id, organizationId: org._id, email, name } },
        { upsert: true, new: true, session },
      );
      const [lead] = await Lead.create(
        [{ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id, source: 'inbound', stage: 'qualified', notes: message }],
        { session, ordered: true },
      );
      await LeadSource.create([{ workspaceId: ws._id, leadId: lead._id, channel: 'inbound', raw: req.body }], { session, ordered: true });
      const [deal] = await Deal.create(
        [{ workspaceId: ws._id, title: company || name, leadId: lead._id, contactId: contact._id, stage: 'new' }],
        { session, ordered: true },
      );
      return { leadId: lead._id, dealId: deal._id };
    });

    alertPositiveReply({ leadTitle: `New enquiry: ${company || name}`, dealId: result.dealId, snippet: message }).catch(() => {});
    return ok(res, { received: true });
  }),
);

/* ---- Pitch page data (client fetches; server also injects meta on the HTML route) ---- */
publicRouter.get(
  '/pitch/:slug',
  asyncHandler(async (req, res) => {
    const page = await getPublicPitch({ slug: req.params.slug, token: req.query.t });
    return ok(res, { businessName: page.businessName, logoUrl: page.logoUrl, sections: page.sections });
  }),
);

publicRouter.post(
  '/pitch/:slug/events',
  validateBody(
    z.object({
      t: z.string(),
      type: z.enum(['view', 'scroll', 'section', 'cta_click']),
      section: z.string().optional(),
      scrollDepth: z.number().optional(),
      sessionId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const r = await recordPitchEvent({ slug: req.params.slug, token: req.body.t, ...req.body });
    if (r.firstView) alertPitchVisit({ leadTitle: r.businessName ?? 'A lead' }).catch(() => {});
    return ok(res, { recorded: true });
  }),
);

/* ---- Unsubscribe (one-click) ---- */
publicRouter.get(
  '/u/:token',
  asyncHandler(async (req, res) => {
    // Token encodes workspaceId:email (base64url). Show a confirmation page in web app.
    res.type('html').send('<p>You have been unsubscribed.</p>');
  }),
);
publicRouter.post(
  '/u/:token',
  asyncHandler(async (req, res) => {
    try {
      const [wsId, email] = Buffer.from(req.params.token, 'base64url').toString('utf8').split(':');
      if (wsId && email) await suppress({ workspaceId: wsId, type: 'email', value: email, reason: 'unsubscribe' });
    } catch {
      /* ignore malformed token */
    }
    return ok(res, { unsubscribed: true });
  }),
);
