import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/integrations/brevo/index.js', () => ({
  sendTransactional: vi.fn(async () => ({ ok: true })),
  sendVerificationOtp: vi.fn(async () => ({})),
  sendPasswordReset: vi.fn(async () => ({})),
}));

const { authenticator } = await import('otplib');
const { Workspace } = await import('../../src/models/Workspace.js');
const { User } = await import('../../src/models/User.js');
const { Membership } = await import('../../src/models/Membership.js');
const { Session } = await import('../../src/models/Session.js');
const auth = await import('../../src/services/auth.service.js');

describe('admin 2FA login', () => {
  let ws;
  let user;
  const password = 'Correct-Horse-9';

  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-2fa' });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Membership.deleteMany({}), Session.deleteMany({})]);
    user = await User.create({
      name: 'Admin',
      email: 'admin@x.com',
      passwordHash: await auth.hashPassword(password),
      emailVerifiedAt: new Date(),
    });
    await Membership.create({ workspaceId: ws._id, userId: user._id, role: 'super_admin' });
  });

  it('an unfinished 2FA setup does not block login', async () => {
    await auth.setupTotp({ userId: user._id }); // secret stored, never confirmed
    const res = await auth.login({ email: 'admin@x.com', password });
    expect(res.accessToken).toBeTruthy();
    // Even a stray code in the box must not fail the login.
    const res2 = await auth.login({ email: 'admin@x.com', password, totp: '123456' });
    expect(res2.accessToken).toBeTruthy();
  });

  it('once confirmed, a valid code is required', async () => {
    const setup = await auth.setupTotp({ userId: user._id });
    const secret = setup.secret || new URL(setup.otpauth).searchParams.get('secret');
    await auth.confirmTotp({ userId: user._id, token: authenticator.generate(secret) });

    await expect(auth.login({ email: 'admin@x.com', password })).rejects.toThrow(/2FA required/);
    await expect(auth.login({ email: 'admin@x.com', password, totp: '000000' })).rejects.toThrow(/Invalid 2FA/);
    const ok = await auth.login({ email: 'admin@x.com', password, totp: authenticator.generate(secret) });
    expect(ok.accessToken).toBeTruthy();
  });
});

describe('client auto-link on email verification', () => {
  it('attaches the verified client to unowned deals for their email', async () => {
    const { Contact } = await import('../../src/models/Contact.js');
    const { Deal } = await import('../../src/models/Deal.js');
    const ws2 = await Workspace.create({ name: 'Link', slug: `klyro-link-${Date.now()}` });
    const u = await User.create({ name: 'C', email: 'buyer@acme.test', passwordHash: 'x', emailVerifiedAt: new Date() });
    await Membership.create({ workspaceId: ws2._id, userId: u._id, role: 'client' });
    const c = await Contact.create({ workspaceId: ws2._id, email: 'buyer@acme.test' });
    const open = await Deal.create({ workspaceId: ws2._id, title: 'Acme', contactId: c._id, stage: 'quote' });
    const taken = await Deal.create({ workspaceId: ws2._id, title: 'Other', contactId: c._id, stage: 'new', clientUserId: new (await import('mongoose')).default.Types.ObjectId() });
    expect(await auth.linkClientDeals(u)).toBe(1);
    expect(String((await Deal.findById(open._id)).clientUserId)).toBe(String(u._id));
    expect(String((await Deal.findById(taken._id)).clientUserId)).not.toBe(String(u._id));
  });
});
