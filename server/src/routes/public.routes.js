import { Router } from 'express';
import { enquirySchema } from '@klyro/shared/schemas';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { publicFormLimiter } from '../middleware/rateLimiter.js';
import { getPublicPitch, recordPitchEvent } from '../services/pitch.service.js';
import { unsubscribeContact } from '../services/reply.service.js';
import { qualifyEnquiry } from '../services/drafting.service.js';
import { sendTransactional } from '../integrations/brevo/index.js';
import { readToken } from '../utils/publicToken.js';
import { Message } from '../models/Message.js';
import { recordEvent } from '../services/analytics.service.js';
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
  publicFormLimiter,
  verifyTurnstile(),
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

/* ---- F41: Project requests (richer inbound + AI qualification + auto-reply) ---- */
publicRouter.post(
  '/project-requests',
  publicFormLimiter,
  verifyTurnstile(),
  validateBody(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      company: z.string().optional(),
      projectType: z.string().optional(),
      budget: z.string().optional(),
      message: z.string().min(1).max(5000),
      website_url: z.string().optional(), // honeypot
    }),
  ),
  asyncHandler(async (req, res) => {
    if (req.body.website_url) return ok(res, { received: true }); // honeypot
    const ws = await defaultWorkspace();
    if (!ws) return ok(res, { received: true });
    const { name, email, company, message, projectType, budget } = req.body;

    const qualified = await qualifyEnquiry({ message, budget, projectType });

    const result = await withTransaction(async (session) => {
      const [org] = await Organization.create([{ workspaceId: ws._id, name: company || name }], { session, ordered: true });
      const contact = await Contact.findOneAndUpdate(
        { workspaceId: ws._id, email },
        { $setOnInsert: { workspaceId: ws._id, organizationId: org._id, email, name } },
        { upsert: true, new: true, session },
      );
      const [lead] = await Lead.create(
        [{ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id, source: 'inbound', stage: qualified.tier === 'spam' ? 'disqualified' : 'qualified', notes: message }],
        { session, ordered: true },
      );
      await LeadSource.create([{ workspaceId: ws._id, leadId: lead._id, channel: 'inbound', raw: { ...req.body, qualified } }], { session, ordered: true });
      let dealId = null;
      if (qualified.tier !== 'spam') {
        const [deal] = await Deal.create(
          [{ workspaceId: ws._id, title: company || name, leadId: lead._id, contactId: contact._id, stage: 'new' }],
          { session, ordered: true },
        );
        dealId = deal._id;
      }
      return { leadId: lead._id, dealId };
    });

    // Auto-reply (Brevo) + Telegram alert, best-effort after commit.
    if (qualified.tier !== 'spam') {
      sendTransactional({
        to: email,
        subject: 'Thanks for reaching out to Klyro',
        htmlContent: `<p>Hi ${name}, thanks for your project enquiry — we'll get back to you shortly.</p>`,
      }).catch(() => {});
      alertPositiveReply({ leadTitle: `New project request (${qualified.tier}): ${company || name}`, dealId: result.dealId, snippet: qualified.summary }).catch(() => {});
    }
    return ok(res, { received: true });
  }),
);

/* ---- F40: server-rendered pitch meta (for link previews / crawlers) ---- */
publicRouter.get(
  '/pitch/:slug/meta',
  asyncHandler(async (req, res) => {
    const page = await getPublicPitch({ slug: req.params.slug, token: req.query.t }).catch(() => null);
    const title = page ? `${page.businessName ?? 'A proposal'} — Klyro` : 'Klyro';
    const desc = page ? `A tailored proposal for ${page.businessName ?? 'your business'} from Klyro.` : 'Klyro';
    const image = page?.logoUrl ?? `${env.WEB_ORIGIN}/og-default.png`;
    const url = `${env.WEB_ORIGIN}/pitch/${req.params.slug}${req.query.t ? `?t=${req.query.t}` : ''}`;
    // Minimal HTML with OG tags. nginx can proxy crawler/bot requests here, or
    // the web app can call it for SSR meta. Human requests still get the SPA.
    res.type('html').send(
      `<!doctype html><html><head><meta charset="utf-8">` +
        `<title>${title}</title>` +
        `<meta name="description" content="${desc}">` +
        `<meta property="og:title" content="${title}">` +
        `<meta property="og:description" content="${desc}">` +
        `<meta property="og:image" content="${image}">` +
        `<meta property="og:url" content="${url}">` +
        `<meta name="twitter:card" content="summary_large_image">` +
        `</head><body><p>${title}</p></body></html>`,
    );
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

/* ---- Unsubscribe (one-click, signed token) ---- */
publicRouter.get(
  '/u/:token',
  asyncHandler(async (req, res) => {
    const data = readToken(req.params.token);
    // GET is a human-facing confirmation; the actual opt-out is the POST
    // (RFC 8058 List-Unsubscribe-Post). Still honour GET for older clients.
    if (data?.k === 'u') {
      await unsubscribeContact({ workspaceId: data.w, email: data.e }).catch(() => {});
    }
    res.type('html').send('<p>You have been unsubscribed. You will receive no further emails.</p>');
  }),
);
publicRouter.post(
  '/u/:token',
  asyncHandler(async (req, res) => {
    const data = readToken(req.params.token);
    if (data?.k === 'u') {
      await unsubscribeContact({ workspaceId: data.w, email: data.e });
    }
    return ok(res, { unsubscribed: true });
  }),
);

/* ---- Click tracking redirect ---- */
publicRouter.get(
  '/t/c/:token',
  asyncHandler(async (req, res) => {
    const data = readToken(req.params.token);
    if (!data || data.k !== 'c' || !/^https?:\/\//.test(data.u)) {
      return res.status(400).send('Invalid link');
    }
    // Record the click event (best-effort), then redirect to the real URL.
    const msg = await Message.findById(data.m).lean().catch(() => null);
    if (msg) {
      recordEvent({
        workspaceId: msg.workspaceId,
        type: 'clicked',
        channel: 'email',
        mailboxId: msg.mailboxId,
        leadId: msg.leadId,
      }).catch(() => {});
    }
    return res.redirect(302, data.u);
  }),
);
