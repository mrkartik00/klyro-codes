import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { Lead } from '../models/Lead.js';
import { LeadSource } from '../models/LeadSource.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { normalizePhone, registrableDomain, isUsableEmail } from '../utils/normalize.js';

/**
 * Upsert one organization + lead from a raw scraped/imported record, deduping
 * by placeId, then registrable domain, then E.164 phone. Runs inside the given
 * session so a batch is atomic. Returns { leadId, created }.
 */
async function ingestOne({ workspaceId, source, reference, record, createdBy }, session) {
  const domain = registrableDomain(record.website || record.domain);
  const phone = normalizePhone(record.phone, record.country);
  const placeId = record.placeId || null;

  const dedupe = [];
  if (placeId) dedupe.push({ placeId });
  if (domain) dedupe.push({ domain });
  if (phone) dedupe.push({ phone });

  let org = dedupe.length
    ? await Organization.findOne({ workspaceId, $or: dedupe }).session(session)
    : null;

  if (!org) {
    [org] = await Organization.create(
      [
        {
          workspaceId,
          createdBy,
          name: record.name,
          placeId,
          domain,
          phone,
          address: record.address,
          city: record.city,
          country: record.country,
          category: record.category,
          rating: record.rating,
          reviewCount: record.reviewCount,
          lat: record.lat,
          lng: record.lng,
        },
      ],
      { session, ordered: true },
    );
  } else {
    // Backfill missing fields only; never overwrite verified data blindly.
    org.name ||= record.name;
    org.domain ||= domain;
    org.phone ||= phone;
    org.rating ??= record.rating;
    org.reviewCount ??= record.reviewCount;
    await org.save({ session });
  }

  let contact = null;
  if (isUsableEmail(record.email)) {
    contact = await Contact.findOneAndUpdate(
      { workspaceId, email: record.email.toLowerCase() },
      { $setOnInsert: { workspaceId, createdBy, organizationId: org._id, email: record.email.toLowerCase() } },
      { upsert: true, new: true, session },
    );
  }

  let lead = await Lead.findOne({ workspaceId, organizationId: org._id }).session(session);
  let created = false;
  if (!lead) {
    [lead] = await Lead.create(
      [
        {
          workspaceId,
          createdBy,
          organizationId: org._id,
          primaryContactId: contact?._id,
          country: record.country,
          source,
        },
      ],
      { session, ordered: true },
    );
    created = true;
    await LeadSource.create(
      [{ workspaceId, createdBy, leadId: lead._id, channel: source, reference, raw: record }],
      { session, ordered: true },
    );
  } else if (contact && !lead.primaryContactId) {
    lead.primaryContactId = contact._id;
    await lead.save({ session });
  }

  return { leadId: lead._id, created, domain: org?.domain ?? domain ?? null };
}

/** Ingest a batch of raw records atomically. Idempotent by dedupe keys. */
export async function ingestBatch({ workspaceId, source, reference, records, createdBy }) {
  return withTransaction(async (session) => {
    const results = [];
    for (const record of records) {
      results.push(await ingestOne({ workspaceId, source, reference, record, createdBy }, session));
    }
    const createdCount = results.filter((r) => r.created).length;
    await writeAudit(
      {
        workspaceId,
        actorId: createdBy,
        actorType: 'n8n',
        action: 'leads.ingestBatch',
        entity: 'lead',
        meta: { source, reference, received: records.length, created: createdCount },
      },
      session,
    );
    return { received: records.length, created: createdCount, leadIds: results.map((r) => r.leadId),
      // Per-lead info so n8n can enrich without re-reading the database.
      leads: results.map((r) => ({ leadId: r.leadId, domain: r.domain, created: r.created })),
    };
  });
}

/**
 * Merge `loserId` into `winnerId`: move contacts, then soft-delete the loser
 * org and lead. Atomic.
 */
export async function mergeLeads({ workspaceId, winnerId, loserId, actorId }) {
  return withTransaction(async (session) => {
    const winner = await Lead.findOne({ workspaceId, _id: winnerId }).session(session);
    const loser = await Lead.findOne({ workspaceId, _id: loserId }).session(session);
    if (!winner || !loser) throw new Error('Lead not found');

    await Contact.updateMany(
      { workspaceId, organizationId: loser.organizationId },
      { $set: { organizationId: winner.organizationId } },
      { session },
    );
    loser.deletedAt = new Date();
    await loser.save({ session });
    await Organization.updateOne(
      { _id: loser.organizationId },
      { $set: { deletedAt: new Date() } },
      { session },
    );
    await writeAudit(
      {
        workspaceId,
        actorId,
        action: 'lead.merge',
        entity: 'lead',
        entityId: winner._id,
        meta: { loserId },
      },
      session,
    );
    return { winnerId, loserId };
  });
}
