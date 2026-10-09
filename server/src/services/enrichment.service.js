import { Lead } from '../models/Lead.js';
import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { WebsiteAudit } from '../models/WebsiteAudit.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { scoreLead } from './scoring.service.js';
import { ApiError } from '../utils/ApiError.js';
import { socialsFromLinks } from '../utils/socialLinks.js';

/**
 * Persist enrichment results for a lead (website audit, verified email,
 * company type, timezone) and recompute its score — atomically.
 * n8n does the actual crawling/PSI/verification and posts the results here.
 */
export async function applyEnrichment({ workspaceId, leadId, audit, email, emailStatus, companyType, timezone, actorId }) {
  return withTransaction(async (session) => {
    const lead = await Lead.findOne({ workspaceId, _id: leadId }).session(session);
    if (!lead) throw ApiError.notFound('Lead not found');
    const org = await Organization.findOne({ workspaceId, _id: lead.organizationId }).session(session);

    let auditDoc = null;
    if (audit) {
      [auditDoc] = await WebsiteAudit.create(
        [{ workspaceId, createdBy: actorId, organizationId: org._id, ...audit }],
        { session, ordered: true },
      );
      lead.auditId = auditDoc._id;
    }

    // Social profiles found on the site become contact channels on the business.
    if (org && audit?.socials && typeof audit.socials === 'object') {
      const found = socialsFromLinks(audit.socials);
      const current = org.socials?.toObject?.() ?? org.socials ?? {};
      org.socials = { ...found, ...Object.fromEntries(Object.entries(current).filter(([, v]) => v)) };
    }

    if (companyType && org) org.companyType = companyType;
    if (org && org.isModified()) await org.save({ session });

    let contact = null;
    if (email) {
      contact = await Contact.findOneAndUpdate(
        { workspaceId, email: email.toLowerCase() },
        {
          $set: { emailStatus: emailStatus ?? 'unknown', organizationId: org?._id },
          $setOnInsert: { workspaceId, createdBy: actorId, email: email.toLowerCase() },
        },
        { upsert: true, new: true, session },
      );
      lead.primaryContactId ??= contact._id;
    } else if (lead.primaryContactId) {
      contact = await Contact.findOne({ workspaceId, _id: lead.primaryContactId }).session(session);
    }

    if (timezone) lead.timezone = timezone;

    const { score, reasons } = scoreLead({
      organization: org ?? {},
      audit: auditDoc ?? audit ?? {},
      contact: contact ?? {},
    });
    lead.score = score;
    lead.scoreBreakdown = { reasons };
    if (lead.stage === 'new') lead.stage = 'enriched';
    await lead.save({ session });

    await writeAudit(
      {
        workspaceId,
        actorId,
        actorType: 'n8n',
        action: 'lead.enriched',
        entity: 'lead',
        entityId: lead._id,
        meta: { score, reasons },
      },
      session,
    );
    return { leadId: lead._id, score, reasons };
  });
}


/**
 * Opportunistic email discovery: for a lead that has a website but no contact
 * email yet, fetch the site via Firecrawl/ScrapingBee (falling back to plain
 * fetch) and extract the first usable email. Attaches it as the lead's primary
 * contact. Safe to call best-effort; returns { email } or { email: null }.
 */
export async function discoverLeadEmail({ workspaceId, leadId, actorId }) {
  const { fetchSite } = await import('../integrations/webfetch/index.js');
  const { isUsableEmail } = await import('../utils/normalize.js');
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;

  const lead = await Lead.findOne({ workspaceId, _id: leadId });
  if (!lead) return { email: null };
  const org = lead.organizationId ? await Organization.findOne({ workspaceId, _id: lead.organizationId }) : null;
  if (!org?.domain) return { email: null };
  // Skip if we already have a contact email.
  if (lead.primaryContactId) {
    const existing = await Contact.findOne({ workspaceId, _id: lead.primaryContactId }).lean();
    if (existing?.email) return { email: existing.email };
  }

  const site = await fetchSite(org.domain).catch(() => null);
  const text = site ? `${site.markdown || ''}\n${site.html || ''}\n${(site.links || []).join('\n')}` : '';
  const candidates = [...new Set((text.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))]
    // Prefer role/company addresses; drop asset filenames that look like emails.
    .filter((e) => isUsableEmail(e) && !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e));
  const email = candidates.find((e) => e.includes(org.domain.replace(/^www\./, ''))) || candidates[0] || null;
  if (!email) return { email: null };

  return withTransaction(async (session) => {
    const contact = await Contact.findOneAndUpdate(
      { workspaceId, email },
      { $setOnInsert: { workspaceId, createdBy: actorId, organizationId: org._id, email, emailStatus: 'unknown' } },
      { upsert: true, new: true, session },
    );
    if (!lead.primaryContactId) {
      lead.primaryContactId = contact._id;
      await lead.save({ session });
    }
    return { email, provider: site?.provider };
  });
}
