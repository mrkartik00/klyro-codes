import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

// Gemini is network; force the deterministic fallback draft.
vi.mock('../../src/integrations/gemini/index.js', () => ({ generateJson: vi.fn(async () => null) }));

const { Workspace } = await import('../../src/models/Workspace.js');
const { Organization } = await import('../../src/models/Organization.js');
const { Contact } = await import('../../src/models/Contact.js');
const { Lead } = await import('../../src/models/Lead.js');
const { Campaign, SequenceStep } = await import('../../src/models/Campaign.js');
const { Template } = await import('../../src/models/Template.js');
const { Enrollment } = await import('../../src/models/Enrollment.js');
const { Message } = await import('../../src/models/Message.js');
const { Approval } = await import('../../src/models/Approval.js');
const { Suppression } = await import('../../src/models/Suppression.js');
const { dueSteps, draftStep, handleBounce } = await import('../../src/services/pipeline.service.js');
const { unsubscribeContact } = await import('../../src/services/reply.service.js');

describe('pipeline.service (draft + due + bounce, ACID)', () => {
  let ws;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-pipeline' });
  });
  beforeEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Contact.deleteMany({}), Lead.deleteMany({}),
      Campaign.deleteMany({}), SequenceStep.deleteMany({}), Template.deleteMany({}),
      Enrollment.deleteMany({}), Message.deleteMany({}), Approval.deleteMany({}), Suppression.deleteMany({}),
    ]);
  });

  async function seed({ due = true, withStep = true } = {}) {
    const org = await Organization.create({ workspaceId: ws._id, name: 'Bright Dental', city: 'Austin' });
    const contact = await Contact.create({ workspaceId: ws._id, organizationId: org._id, email: 'hi@bright.com' });
    const lead = await Lead.create({ workspaceId: ws._id, organizationId: org._id, primaryContactId: contact._id });
    const campaign = await Campaign.create({ workspaceId: ws._id, name: 'C' });
    const tpl = await Template.create({ workspaceId: ws._id, name: 'T', variants: [{ body: 'hi' }] });
    if (withStep) await SequenceStep.create({ workspaceId: ws._id, campaignId: campaign._id, order: 1, delayDays: 0, templateId: tpl._id });
    const enr = await Enrollment.create({
      workspaceId: ws._id, campaignId: campaign._id, leadId: lead._id, contactId: contact._id,
      currentStep: 1, status: 'active', nextDueAt: due ? new Date(Date.now() - 1000) : new Date(Date.now() + 3600_000),
    });
    return { enr, contact, org };
  }

  it('dueSteps returns only enrollments past nextDueAt with a matching step', async () => {
    const { enr } = await seed({ due: true });
    await seed({ due: false });
    const rows = await dueSteps({ workspaceId: ws._id });
    expect(rows).toHaveLength(1);
    expect(String(rows[0].enrollmentId)).toBe(String(enr._id));
    expect(rows[0].stepOrder).toBe(1);
  });

  it('draftStep creates a pending approval and is idempotent per (enrollment, step)', async () => {
    const { enr } = await seed();
    const first = await draftStep({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(first.status).toBe('pending');
    expect(await Approval.countDocuments({ enrollmentId: enr._id })).toBe(1);
    const second = await draftStep({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(second.idempotent).toBe(true);
    expect(await Approval.countDocuments({ enrollmentId: enr._id })).toBe(1);
    // draft references a real fact via the fallback (business name).
    const appr = await Approval.findOne({ enrollmentId: enr._id });
    expect(appr.draft.body).toContain('Bright Dental');
  });

  it('dueSteps skips a step that already has an approval', async () => {
    const { enr } = await seed();
    await draftStep({ workspaceId: ws._id, enrollmentId: enr._id, stepOrder: 1 });
    expect(await dueSteps({ workspaceId: ws._id })).toHaveLength(0);
  });

  it('handleBounce marks message bounced, invalidates+suppresses email, stops enrollment', async () => {
    const { enr, contact } = await seed();
    const msg = await Message.create({
      workspaceId: ws._id, enrollmentId: enr._id, contactId: contact._id, leadId: enr.leadId,
      direction: 'outbound', status: 'sent', providerMessageId: 'g-bounce-1', headerToken: 'tok1',
    });
    const res = await handleBounce({
      workspaceId: ws._id, providerMessageId: 'g-bounce-1', contactEmail: 'hi@bright.com',
      dsnText: '550 5.1.1 user unknown',
    });
    expect(res).toMatchObject({ handled: true, hard: true, matched: true });
    expect((await Message.findById(msg._id)).status).toBe('bounced');
    expect((await Contact.findById(contact._id)).emailStatus).toBe('invalid');
    expect(await Suppression.findOne({ workspaceId: ws._id, type: 'email', value: 'hi@bright.com' })).toBeTruthy();
    expect((await Enrollment.findById(enr._id)).status).toBe('bounced');
  });

  it('handleBounce is idempotent', async () => {
    const { enr, contact } = await seed();
    await Message.create({
      workspaceId: ws._id, enrollmentId: enr._id, contactId: contact._id, leadId: enr.leadId,
      direction: 'outbound', status: 'sent', providerMessageId: 'g-b2',
    });
    await handleBounce({ workspaceId: ws._id, providerMessageId: 'g-b2', contactEmail: 'hi@bright.com', dsnText: '550' });
    const second = await handleBounce({ workspaceId: ws._id, providerMessageId: 'g-b2', contactEmail: 'hi@bright.com', dsnText: '550' });
    expect(second.idempotent).toBe(true);
  });

  it('unsubscribeContact suppresses and stops all active enrollments', async () => {
    const { enr, contact } = await seed();
    const res = await unsubscribeContact({ workspaceId: ws._id, email: 'hi@bright.com' });
    expect(res.unsubscribed).toBe(true);
    expect((await Enrollment.findById(enr._id)).status).toBe('stopped');
    expect(await Suppression.findOne({ workspaceId: ws._id, type: 'email', value: 'hi@bright.com' })).toBeTruthy();
    void contact;
  });
});
