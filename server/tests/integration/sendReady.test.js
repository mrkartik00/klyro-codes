import { describe, expect, it, beforeAll, beforeEach } from 'vitest';

import { Workspace } from '../../src/models/Workspace.js';
import { Organization } from '../../src/models/Organization.js';
import { Contact } from '../../src/models/Contact.js';
import { Lead } from '../../src/models/Lead.js';
import { Campaign } from '../../src/models/Campaign.js';
import { Enrollment } from '../../src/models/Enrollment.js';
import { Mailbox } from '../../src/models/Mailbox.js';
import { Message } from '../../src/models/Message.js';
import { Approval } from '../../src/models/Approval.js';
import { claimSend, readySends, recordSendResult } from '../../src/services/send.service.js';
import { resolveReplyEnrollment } from '../../src/services/reply.service.js';
import { readToken } from '../../src/utils/publicToken.js';

describe('approved-draft send loop', () => {
  let ws;

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-send-ready' });
  });

  beforeEach(async () => {
    await Promise.all(
      [Organization, Contact, Lead, Campaign, Enrollment, Mailbox, Message, Approval].map((M) => M.deleteMany({})),
    );
    await Mailbox.create({
      workspaceId: ws._id,
      address: 'admin@klyro.codes',
      status: 'active',
      dailyCap: 10,
      sentToday: 0,
      lastSentAt: new Date(Date.now() - 3600_000),
    });
  });

  let n = 0;
  async function seed(approvalStatus, email) {
    n += 1;
    const org = await Organization.create({ workspaceId: ws._id, name: 'Acme Plumbing' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email: email || `Owner${n}@Acme.com` });
    const lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id });
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
    if (approvalStatus) {
      await Approval.create({
        workspaceId: ws._id,
        enrollmentId: enr._id,
        leadId: lead._id,
        stepOrder: 1,
        status: approvalStatus,
        decidedAt: new Date(),
        draft: { subject: 'Online booking for Acme', body: 'Hi — quick idea…' },
      });
    }
    return enr;
  }

  it('lists only approved, unsent, due steps', async () => {
    const approved = await seed('approved');
    await seed('pending');
    await seed('rejected');
    const ready = await readySends({ workspaceId: ws._id });
    expect(ready).toEqual([{ enrollmentId: String(approved._id), stepOrder: 1 }]);
  });

  it('claim returns the approved subject/body and a signed unsubscribe link', async () => {
    const enr = await seed('approved', 'Owner@Acme.com');
    const claim = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(claim.claimed).toBe(true);
    expect(claim.subject).toBe('Online booking for Acme');
    expect(claim.body).toContain('quick idea');
    const token = claim.unsubscribeUrl.split('/public/u/')[1];
    expect(readToken(token)).toMatchObject({ k: 'u', w: String(ws._id), e: 'owner@acme.com' });
    // Claimed → no longer ready.
    expect(await readySends({ workspaceId: ws._id })).toEqual([]);
  });

  it('refuses to claim a step whose draft is not approved', async () => {
    const enr = await seed('pending');
    const claim = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(claim).toMatchObject({ claimed: false, reason: 'draft_pending' });
  });

  it('matches a reply to its enrollment by Gmail thread, then by sender', async () => {
    const enr = await seed('approved', 'Owner@Acme.com');
    const claim = await claimSend({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    await recordSendResult({ workspaceId: ws._id, messageId: claim.messageId, ok: true, providerMessageId: 'm1', threadId: 't-123' });
    expect(await resolveReplyEnrollment({ workspaceId: ws._id, threadId: 't-123' })).toBe(String(enr._id));
    expect(await resolveReplyEnrollment({ workspaceId: ws._id, contactEmail: 'owner@acme.com' })).toBe(String(enr._id));
    expect(await resolveReplyEnrollment({ workspaceId: ws._id, threadId: 'nope', contactEmail: 'x@y.com' })).toBeNull();
  });
});
