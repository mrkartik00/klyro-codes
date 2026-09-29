import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/integrations/brevo/index.js', () => ({
  sendTransactional: vi.fn(async () => ({ ok: true })),
  sendVerificationOtp: vi.fn(async () => ({})),
  sendPasswordReset: vi.fn(async () => ({})),
}));
vi.mock('../../src/integrations/gemini/index.js', () => ({ generateJson: vi.fn(async () => null) }));

const { Workspace } = await import('../../src/models/Workspace.js');
const { User } = await import('../../src/models/User.js');
const { Membership } = await import('../../src/models/Membership.js');
const { Session } = await import('../../src/models/Session.js');
const auth = await import('../../src/services/auth.service.js');
const { qualifyEnquiry } = await import('../../src/services/drafting.service.js');

describe('F: magic link + enquiry qualification', () => {
  let ws, user;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-magic' });
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Membership.deleteMany({}), Session.deleteMany({})]);
    user = await User.create({ name: 'C', email: 'c@x.com', passwordHash: 'x', emailVerifiedAt: new Date() });
    await Membership.create({ workspaceId: ws._id, userId: user._id, role: 'client' });
  });

  it('requestMagicLink always succeeds (no enumeration) and sets a token', async () => {
    const res = await auth.requestMagicLink({ email: 'c@x.com' });
    expect(res.requested).toBe(true);
    const reloaded = await User.findOne({ email: 'c@x.com' }).select('+magicTokenHash');
    expect(reloaded.magicTokenHash).toBeTruthy();
    // unknown email still returns success
    expect((await auth.requestMagicLink({ email: 'nope@x.com' })).requested).toBe(true);
  });

  it('loginWithMagicLink issues tokens for a valid link and rejects a bad one', async () => {
    // Manually seed a known token.
    const crypto = await import('node:crypto');
    const raw = 'tok123';
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await User.updateOne({ _id: user._id }, { $set: { magicTokenHash: hash, magicTokenExpires: new Date(Date.now() + 60000) } });
    const res = await auth.loginWithMagicLink({ email: 'c@x.com', token: raw });
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    await expect(auth.loginWithMagicLink({ email: 'c@x.com', token: 'wrong' })).rejects.toBeTruthy();
  });

  it('qualifyEnquiry falls back to warm tier without AI', async () => {
    const q = await qualifyEnquiry({ message: 'I need a website', budget: '5k' });
    expect(['hot', 'warm', 'cold', 'spam']).toContain(q.tier);
    expect(q.tier).toBe('warm');
  });
});
