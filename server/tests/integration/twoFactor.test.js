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
