import { describe, expect, it, beforeAll, beforeEach } from 'vitest';

import { Workspace } from '../../src/models/Workspace.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { Campaign } from '../../src/models/Campaign.js';
import { Enrollment } from '../../src/models/Enrollment.js';
import { Message } from '../../src/models/Message.js';
import { Deal } from '../../src/models/Deal.js';
import { Suppression } from '../../src/models/Suppression.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { handleReply } from '../../src/services/reply.service.js';

describe('reply.service (ACID stop + deal advance)', () => {
  let ws;

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-reply' });
  });
  beforeEach(async () => {
    await Promise.all([
      Organization.deleteMany({}),
      Contact.deleteMany({}),
      Lead.deleteMany({}),
      Campaign.deleteMany({}),
      Enrollment.deleteMany({}),
      Message.deleteMany({}),
      Deal.deleteMany({}),
      Suppression.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  async function seed(email = 'lead@x.com') {
    const org = await Organization.create({ workspaceId: ws._id, name: 'X' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email });
    const lead = await Lead.create({
      workspaceId: ws._id,
      organizationId: org._id,
      primaryContactId: contact._id,
      stage: 'enrolled',
    });
    const campaign = await Campaign.create({ workspaceId: ws._id, name: 'C' });
    const enr = await Enrollment.create({
      workspaceId: ws._id,
      campaignId: campaign._id,
      leadId: lead._id,
      contactId: contact._id,
      status: 'active',
    });
    return { enr, lead };
  }

  it('interested reply stops the enrollment and creates a deal at "replied"', async () => {
    const { enr } = await seed();
    const res = await handleReply({
      workspaceId: ws._id,
      enrollmentId: enr._id,
      contactEmail: 'lead@x.com',
      replyClass: 'interested',
      subject: 'Re',
      body: 'Sounds good, what is the cost?',
      providerMessageId: 'in-1',
    });
    expect(res.stopped).toBe(true);
    expect((await Enrollment.findById(enr._id)).status).toBe('replied');
    const deal = await Deal.findById(res.dealId);
    expect(deal.stage).toBe('replied');
    // Two transitions (new→contacted→replied) each wrote an audit entry.
    expect(await AuditLog.countDocuments({ action: 'deal.transition' })).toBe(2);
  });

  it('unsubscribe reply suppresses the email and stops the enrollment', async () => {
    const { enr } = await seed('bye@x.com');
    await handleReply({
      workspaceId: ws._id,
      enrollmentId: enr._id,
      contactEmail: 'bye@x.com',
      replyClass: 'unsubscribe',
      providerMessageId: 'in-2',
    });
    expect((await Enrollment.findById(enr._id)).status).toBe('stopped');
    expect(await Suppression.findOne({ workspaceId: ws._id, value: 'bye@x.com' })).toBeTruthy();
    expect(await Deal.countDocuments()).toBe(0);
  });

  it('is idempotent on repeated provider message id', async () => {
    const { enr } = await seed();
    const args = {
      workspaceId: ws._id,
      enrollmentId: enr._id,
      contactEmail: 'lead@x.com',
      replyClass: 'interested',
      providerMessageId: 'dup-1',
    };
    await handleReply(args);
    const second = await handleReply(args);
    expect(second.idempotent).toBe(true);
    expect(await Deal.countDocuments()).toBe(1);
  });

  it('not_interested stops without creating a deal', async () => {
    const { enr } = await seed('no@x.com');
    const res = await handleReply({
      workspaceId: ws._id,
      enrollmentId: enr._id,
      contactEmail: 'no@x.com',
      replyClass: 'not_interested',
      providerMessageId: 'in-3',
    });
    expect(res.stopped).toBe(true);
    expect((await Enrollment.findById(enr._id)).status).toBe('replied');
    expect(await Deal.countDocuments()).toBe(0);
  });
});
