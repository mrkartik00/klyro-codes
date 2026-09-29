import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { Workspace } from '../../src/models/Workspace.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { WebsiteAudit } from '../../src/models/WebsiteAudit.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { applyEnrichment } from '../../src/services/enrichment.service.js';

describe('enrichment.service (ACID)', () => {
  let ws;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-enrich' });
  });
  beforeEach(async () => {
    await Promise.all([
      Organization.deleteMany({}),
      Contact.deleteMany({}),
      Lead.deleteMany({}),
      WebsiteAudit.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  it('stores the audit, verified email and recomputes the score in one txn', async () => {
    const org = await Organization.create({
      workspaceId: ws._id,
      name: 'Bright Smile',
      category: 'Dentist',
      rating: 4.6,
      reviewCount: 120,
    });
    const lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, stage: 'new' });

    const res = await applyEnrichment({
      workspaceId: ws._id,
      leadId: lead._id,
      audit: { reachable: false, issues: ['no-website'] },
      email: 'hello@brightsmile.com',
      emailStatus: 'valid',
      companyType: 'unknown',
      timezone: 'America/Chicago',
    });

    expect(res.score).toBeGreaterThanOrEqual(65);
    const reloaded = await Lead.findById(lead._id);
    expect(reloaded.stage).toBe('enriched');
    expect(reloaded.timezone).toBe('America/Chicago');
    expect(reloaded.auditId).toBeTruthy();
    expect(await Contact.findOne({ email: 'hello@brightsmile.com' })).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'lead.enriched' })).toBe(1);
  });
});
