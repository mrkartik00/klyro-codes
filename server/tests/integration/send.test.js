import { describe, expect, it, beforeAll, beforeEach } from 'vitest';

import { Workspace } from '../../src/models/Workspace.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { Campaign } from '../../src/models/Campaign.js';
import { Enrollment } from '../../src/models/Enrollment.js';
import { Mailbox } from '../../src/models/Mailbox.js';
import { Message } from '../../src/models/Message.js';
import { Suppression } from '../../src/models/Suppression.js';
import { claimSend, recordSendResult } from '../../src/services/send.service.js';

describe('send.service atomic cap (ACID)', () => {
  let ws;

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-send' });
  });
  beforeEach(async () => {
    await Promise.all([
      Organization.deleteMany({}),
      Contact.deleteMany({}),
      Lead.deleteMany({}),
      Campaign.deleteMany({}),
      Enrollment.deleteMany({}),
      Mailbox.deleteMany({}),
      Message.deleteMany({}),
      Suppression.deleteMany({}),
    ]);
  });

  async function seedEnrollment(email = 'lead@x.com') {
    const org = await Organization.create({ workspaceId: ws._id, name: 'X' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email });
    const lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id });
    // 24h send window so cap/idempotency tests aren't gated by wall-clock time.
    const campaign = await Campaign.create({
      workspaceId: ws._id,
      name: 'C',
      sendWindow: { startHour: 0, endHour: 24, businessDaysOnly: false },
    });
    const enr = await Enrollment.create({
      workspaceId: ws._id,
      campaignId: campaign._id,
      leadId: lead._id,
      contactId: contact._id,
      currentStep: 1,
    });
    return enr;
  }

  it('never exceeds dailyCap under concurrent claims', async () => {
    await Mailbox.create({
      workspaceId: ws._id,
      address: 'send@getklyro.com',
      status: 'active',
      dailyCap: 3,
      sentToday: 0,
      // Pre-date past the send gap so the cap (not the gap) is what's under test.
      lastSentAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    // 5 enrollments try to claim at once; only 3 slots exist.
    const enrs = await Promise.all([1, 2, 3, 4, 5].map((i) => seedEnrollment(`l${i}@x.com`)));
    const results = await Promise.all(
      enrs.map((e) => claimSend({ workspaceId: ws._id, enrollmentId: e._id, stepOrder: 1 })),
    );
    const claimed = results.filter((r) => r.claimed);
    expect(claimed).toHaveLength(3);
    const mb = await Mailbox.findOne({ address: 'send@getklyro.com' });
    expect(mb.sentToday).toBe(3);
  });

  it('is idempotent per (enrollment, step)', async () => {
    await Mailbox.create({ workspaceId: ws._id, address: 'm@getklyro.com', status: 'active', dailyCap: 10 });
    const enr = await seedEnrollment();
    const first = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    const second = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(second.idempotent).toBe(true);
    expect(String(second.messageId)).toBe(String(first.messageId));
    expect((await Mailbox.findOne({ address: 'm@getklyro.com' })).sentToday).toBe(1);
  });

  it('refuses to claim for a suppressed contact', async () => {
    await Mailbox.create({ workspaceId: ws._id, address: 'm2@getklyro.com', status: 'active', dailyCap: 10 });
    const enr = await seedEnrollment('blocked@x.com');
    await Suppression.create({ workspaceId: ws._id, type: 'email', value: 'blocked@x.com', reason: 'manual' });
    const res = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(res).toMatchObject({ claimed: false, reason: 'suppressed' });
  });

  it('records a successful send result and stores providerMessageId', async () => {
    await Mailbox.create({ workspaceId: ws._id, address: 'm3@getklyro.com', status: 'active', dailyCap: 10 });
    const enr = await seedEnrollment();
    const claim = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    await recordSendResult({
      workspaceId: ws._id,
      messageId: claim.messageId,
      ok: true,
      providerMessageId: 'gmail-abc',
      threadId: 'thread-1',
    });
    const msg = await Message.findById(claim.messageId);
    expect(msg.status).toBe('sent');
    expect(msg.providerMessageId).toBe('gmail-abc');
    expect((await Enrollment.findById(enr._id)).threadId).toBe('thread-1');
  });

  it('refuses to claim outside the campaign send window', async () => {
    await Mailbox.create({ workspaceId: ws._id, address: 'w@getklyro.com', status: 'active', dailyCap: 10 });
    const org = await Organization.create({ workspaceId: ws._id, name: 'Y' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email: 'y@x.com' });
    const lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id });
    // Window that can never contain "now" (start == end).
    const campaign = await Campaign.create({
      workspaceId: ws._id,
      name: 'Closed',
      sendWindow: { startHour: 3, endHour: 3, businessDaysOnly: false },
    });
    const enr = await Enrollment.create({
      workspaceId: ws._id,
      campaignId: campaign._id,
      leadId: lead._id,
      contactId: contact._id,
      currentStep: 1,
    });
    const res = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(res).toMatchObject({ claimed: false, reason: 'outside_send_window' });
  });

  it('refuses a UK non-incorporated lead (PECR)', async () => {
    await Mailbox.create({ workspaceId: ws._id, address: 'uk@getklyro.com', status: 'active', dailyCap: 10 });
    const org = await Organization.create({ workspaceId: ws._id, name: 'Sole', country: 'GB', companyType: 'sole_trader' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email: 'sole@uk.co' });
    const lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id });
    const campaign = await Campaign.create({
      workspaceId: ws._id,
      name: 'UK',
      sendWindow: { startHour: 0, endHour: 24, businessDaysOnly: false },
    });
    const enr = await Enrollment.create({
      workspaceId: ws._id,
      campaignId: campaign._id,
      leadId: lead._id,
      contactId: contact._id,
      currentStep: 1,
    });
    const res = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(res).toMatchObject({ claimed: false, reason: 'uk_not_incorporated' });
  });

  it('advances the enrollment step and schedules the next when a step exists', async () => {
    const { SequenceStep } = await import('../../src/models/Campaign.js');
    const { Template } = await import('../../src/models/Template.js');
    await Mailbox.create({ workspaceId: ws._id, address: 'adv@getklyro.com', status: 'active', dailyCap: 10 });
    const enr = await seedEnrollment('adv@x.com');
    const tpl = await Template.create({ workspaceId: ws._id, name: 'T', variants: [{ body: 'hi' }] });
    await SequenceStep.create({ workspaceId: ws._id, campaignId: enr.campaignId, order: 2, delayDays: 2, templateId: tpl._id });
    const claim = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    await recordSendResult({ workspaceId: ws._id, messageId: claim.messageId, ok: true, providerMessageId: 'g1' });
    const after = await Enrollment.findById(enr._id);
    expect(after.currentStep).toBe(2);
    expect(after.nextDueAt).toBeTruthy();
    expect(after.status).toBe('active');
  });

  it('completes the enrollment when there is no next step', async () => {
    await Mailbox.create({ workspaceId: ws._id, address: 'done@getklyro.com', status: 'active', dailyCap: 10 });
    const enr = await seedEnrollment('done@x.com');
    const claim = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    await recordSendResult({ workspaceId: ws._id, messageId: claim.messageId, ok: true, providerMessageId: 'g2' });
    const after = await Enrollment.findById(enr._id);
    expect(after.status).toBe('completed');
    expect(after.nextDueAt).toBeNull();
  });
});
