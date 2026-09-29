import { Lead } from '../models/Lead.js';
import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { WebsiteAudit } from '../models/WebsiteAudit.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { scoreLead } from './scoring.service.js';
import { ApiError } from '../utils/ApiError.js';

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

    if (companyType && org) {
      org.companyType = companyType;
      await org.save({ session });
    }

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
