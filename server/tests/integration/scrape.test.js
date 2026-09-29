import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/integrations/n8n/index.js', () => ({
  triggerWorkflow: vi.fn(async () => ({ ok: true })),
  listWorkflows: vi.fn(async () => []),
  setWorkflowActive: vi.fn(async () => ({})),
  listExecutions: vi.fn(async () => []),
}));

const { Workspace } = await import('../../src/models/Workspace.js');
const { Organization } = await import('../../src/models/Organization.js');
const { Lead } = await import('../../src/models/Lead.js');
const { ScrapeTarget } = await import('../../src/models/ScrapeTarget.js');
const { ScrapeJob } = await import('../../src/models/ScrapeTarget.js');
const { startScrapeJob, updateScrapeProgress, importLeadsCsv, parseCsv } = await import('../../src/services/scrape.service.js');

describe('scrape.service (E)', () => {
  let ws;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-scrape' });
  });
  beforeEach(async () => {
    await Promise.all([Organization.deleteMany({}), Lead.deleteMany({}), ScrapeTarget.deleteMany({}), ScrapeJob.deleteMany({})]);
  });

  it('parseCsv handles headers and quoted fields', () => {
    const rows = parseCsv('name,city\n"Bright, Inc",Austin\nAcme,NYC');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Bright, Inc', city: 'Austin' });
  });

  it('startScrapeJob creates a queued job for a target', async () => {
    const target = await ScrapeTarget.create({ workspaceId: ws._id, name: 'T', country: 'US', maxResults: 50 });
    const job = await startScrapeJob({ workspaceId: ws._id, scrapeTargetId: target._id });
    expect(job.status).toBe('queued');
    expect(job.requested).toBe(50);
  });

  it('updateScrapeProgress transitions status and computes pct', async () => {
    const target = await ScrapeTarget.create({ workspaceId: ws._id, name: 'T', country: 'US', maxResults: 100 });
    const job = await startScrapeJob({ workspaceId: ws._id, scrapeTargetId: target._id });
    const updated = await updateScrapeProgress({ workspaceId: ws._id, scrapeJobId: job._id, status: 'ingesting', found: 40, ingested: 25 });
    expect(updated.status).toBe('ingesting');
    expect(updated.progressPct).toBe(25);
  });

  it('importLeadsCsv ingests rows via ingestBatch (idempotent)', async () => {
    const csv = 'name,website,email,country\nBright Dental,brightdental.com,hi@brightdental.com,US\nAcme,acme.io,,US';
    const first = await importLeadsCsv({ workspaceId: ws._id, csv });
    expect(first.received).toBe(2);
    expect(first.created).toBe(2);
    // Re-import: dedupe means no new leads.
    const second = await importLeadsCsv({ workspaceId: ws._id, csv });
    expect(second.created).toBe(0);
  });
});
