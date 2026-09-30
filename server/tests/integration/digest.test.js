import { describe, expect, it } from 'vitest';
import { Workspace } from '../../src/models/Workspace.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { buildDigest } from '../../src/services/digest.service.js';

describe('morning digest', () => {
  it('lists Reddit buyers and the best reachable businesses, HTML-escaped', async () => {
    const ws = await Workspace.create({ name: 'K', slug: 'klyro-digest' });
    const o1 = await Organization.create({ workspaceId: ws._id, name: 'Acme <Roofing>', city: 'Austin', category: 'roofer' });
    const c1 = await Contact.create({ workspaceId: ws._id, organizationId: o1._id, email: 'a@acme.com', emailStatus: 'valid' });
    await Lead.create({ workspaceId: ws._id, organizationId: o1._id, primaryContactId: c1._id, source: 'maps', score: 70 });
    const o2 = await Organization.create({ workspaceId: ws._id, name: 'Old Co' });
    await Lead.create({ workspaceId: ws._id, organizationId: o2._id, source: 'maps', score: 99, createdAt: new Date('2020-01-01') });
    const o3 = await Organization.create({ workspaceId: ws._id, name: 'u/x' });
    await Lead.create({
      workspaceId: ws._id,
      organizationId: o3._id,
      source: 'reddit',
      sourceUrl: 'https://reddit.com/r/forhire/1',
      intent: { score: 0.9, title: '[Hiring] Flutter dev for booking app', need: 'booking app', community: 'r/forhire', externalId: 't3_dig' },
    });
    const text = await buildDigest({ workspaceId: ws._id, hours: 24 });
    expect(text).toContain('1 people hiring · 1 new businesses');
    expect(text).toContain('[Hiring] Flutter dev for booking app');
    expect(text).toContain('Acme &lt;Roofing&gt;');
    expect(text).not.toContain('Old Co');
  });
});
