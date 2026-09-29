import { ScrapeJob } from '../models/ScrapeTarget.js';
import { ScrapeTarget } from '../models/ScrapeTarget.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { triggerWorkflow } from '../integrations/n8n/index.js';
import { emitToWorkspace } from '../socket/index.js';
import { ingestBatch } from './lead.service.js';
import { ApiError } from '../utils/ApiError.js';

// Minimal CSV parser: handles quoted fields and commas. Good enough for lead
// imports; avoids a dependency. Expects a header row.
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  const src = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n') { record.push(field); rows.push(record); field = ''; record = []; }
    else field += c;
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, idx) => [h, (r[idx] ?? '').trim()])));
}

/**
 * E38 — import leads from CSV text. Maps common columns then reuses the
 * transactional, idempotent ingestBatch. Chunks large files.
 */
export async function importLeadsCsv({ workspaceId, csv, createdBy }) {
  const parsed = parseCsv(csv);
  if (!parsed.length) throw ApiError.badRequest('CSV has no data rows');

  const records = parsed.map((row) => ({
    name: row.name || row.business || row.company || row.Name,
    website: row.website || row.domain || row.url || row.Website,
    email: row.email || row.Email,
    phone: row.phone || row.Phone,
    address: row.address || row.Address,
    city: row.city || row.City,
    country: row.country || row.Country,
    category: row.category || row.Category,
  }));

  let created = 0;
  const leadIds = [];
  const CHUNK = 100;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    const res = await ingestBatch({ workspaceId, source: 'csv', reference: 'import', records: batch, createdBy });
    created += res.created;
    leadIds.push(...res.leadIds);
  }
  return { received: records.length, created, leadIds };
}

const COUNTRY_NAMES = { US: 'USA', GB: 'UK', UK: 'UK' };

/**
 * Google Maps search strings for a target: every (category|keyword) × city,
 * e.g. "dentist in Austin, USA". Capped so one job can't run for hours.
 */
export function buildScrapeQueries(target, max = 40) {
  if (!target) return [];
  const terms = [...new Set([...(target.categories ?? []), ...(target.keywords ?? [])].map((s) => s.trim()).filter(Boolean))];
  const cities = [...new Set((target.cities ?? []).map((s) => s.trim()).filter(Boolean))];
  const country = COUNTRY_NAMES[target.country?.toUpperCase()] ?? target.country ?? '';
  const where = (city) => [city, country].filter(Boolean).join(', ');
  const out = [];
  for (const term of terms) {
    if (!cities.length) out.push(country ? `${term} in ${country}` : term);
    for (const city of cities) out.push(`${term} in ${where(city)}`);
  }
  return out.slice(0, max);
}

/** E35 — start a scrape job for a target and trigger the n8n workflow. */
export async function startScrapeJob({ workspaceId, scrapeTargetId, createdBy }) {
  const job = await withTransaction(async (session) => {
    const target = await ScrapeTarget.findOne({ workspaceId, _id: scrapeTargetId }).session(session);
    if (!target) throw ApiError.notFound('Scrape target not found');
    const [j] = await ScrapeJob.create(
      [{ workspaceId, createdBy, scrapeTargetId, status: 'queued', requested: target.maxResults ?? 0 }],
      { session, ordered: true },
    );
    await writeAudit(
      { workspaceId, actorId: createdBy, action: 'scrape.start', entity: 'scrapeJob', entityId: j._id, meta: { scrapeTargetId } },
      session,
    );
    return j;
  });

  // Fire the n8n workflow (outside the txn; external call). n8n gets everything
  // it needs to run the scrape, so it never reads the database itself.
  const target = await ScrapeTarget.findOne({ workspaceId, _id: scrapeTargetId }).lean();
  await triggerWorkflow('scrape-start', {
    workspaceId: String(workspaceId),
    scrapeJobId: String(job._id),
    scrapeTargetId: String(scrapeTargetId),
    queries: buildScrapeQueries(target),
    country: target?.country,
    maxResults: target?.maxResults ?? 200,
    filters: target?.filters ?? {},
  }).catch(() => {});

  return job;
}

/**
 * E35 — update job progress (called by n8n via /internal). Transitions the job
 * status and emits a live progress event to the admin UI.
 */
export async function updateScrapeProgress({ workspaceId, scrapeJobId, status, found, ingested, error }) {
  const job = await withTransaction(async (session) => {
    const j = await ScrapeJob.findOne({ workspaceId, _id: scrapeJobId }).session(session);
    if (!j) throw ApiError.notFound('Scrape job not found');
    if (status) j.status = status;
    if (typeof found === 'number') j.found = found;
    if (typeof ingested === 'number') j.ingested = ingested;
    if (error) j.error = String(error).slice(0, 500);
    if (status === 'running' && !j.startedAt) j.startedAt = new Date();
    if (['enriched', 'failed'].includes(status)) j.finishedAt = new Date();
    if (j.requested > 0) j.progressPct = Math.min(100, Math.round(((j.ingested || 0) / j.requested) * 100));
    await j.save({ session });
    return j;
  });
  emitToWorkspace(workspaceId, 'scrape:progress', {
    scrapeJobId,
    status: job.status,
    found: job.found,
    ingested: job.ingested,
    progressPct: job.progressPct,
  });
  return job;
}
