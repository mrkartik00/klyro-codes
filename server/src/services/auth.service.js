import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { authenticator } from 'otplib';

import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { Membership } from '../models/Membership.js';
import { Contact } from '../models/Contact.js';
import { Deal } from '../models/Deal.js';
import { Session } from '../models/Session.js';
import { withTransaction } from '../utils/transaction.js';
import { ApiError } from '../utils/ApiError.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { sendVerificationOtp, sendPasswordReset, sendTransactional } from '../integrations/brevo/index.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const genOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function hashPassword(pw) {
  return argon2.hash(pw, { type: argon2.argon2id });
}

function signAccess(user, membership) {
  return jwt.sign(
    {
      sub: String(user._id),
      workspaceId: String(membership.workspaceId),
      role: membership.role,
      twoFactorEnabled: Boolean(user.totpEnabledAt),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL },
  );
}

async function issueRefresh(user, { userAgent, ip } = {}, session) {
  const familyId = crypto.randomUUID();
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Session.create(
    [{ userId: user._id, familyId, tokenHash: sha256(raw), userAgent, ip, expiresAt }],
    { session, ordered: true },
  );
  const token = jwt.sign({ sub: String(user._id), familyId, raw }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
  });
  return token;
}

/** Register a user; if it's the first user, create the workspace + owner membership. */
export async function register({ name, email, password }) {
  return withTransaction(async (session) => {
    const existing = await User.findOne({ email }).session(session);
    if (existing) throw ApiError.conflict('Email already registered');

    const passwordHash = await hashPassword(password);
    const code = genOtp();
    const [user] = await User.create(
      [
        {
          name,
          email,
          passwordHash,
          verifyCodeHash: sha256(code),
          verifyCodeExpires: new Date(Date.now() + 15 * 60 * 1000),
        },
      ],
      { session, ordered: true },
    );

    // Bootstrap: first ever user owns a new workspace as super_admin.
    // Clients join the main (oldest) workspace.
    const anyWs = await Workspace.findOne().sort({ createdAt: 1 }).session(session);
    let workspace = anyWs;
    if (!anyWs) {
      [workspace] = await Workspace.create(
        [{ name: `${name}'s workspace`, slug: `ws-${crypto.randomBytes(4).toString('hex')}`, createdBy: user._id }],
        { session, ordered: true },
      );
    }
    await Membership.create(
      [{ workspaceId: workspace._id, userId: user._id, role: anyWs ? 'client' : 'super_admin' }],
      { session, ordered: true },
    );

    await sendVerificationOtp(email, code);
    return { userId: user._id, workspaceId: workspace._id };
  });
}

export async function verifyEmail({ email, code }) {
  const user = await User.findOne({ email }).select('+verifyCodeHash +verifyCodeExpires');
  if (!user) throw ApiError.notFound('User not found');
  if (user.emailVerifiedAt) return { verified: true };
  if (!user.verifyCodeHash || !user.verifyCodeExpires || user.verifyCodeExpires < new Date()) {
    throw ApiError.badRequest('Code expired');
  }
  if (user.verifyCodeHash !== sha256(code)) throw ApiError.badRequest('Invalid code');
  user.emailVerifiedAt = new Date();
  user.verifyCodeHash = null;
  user.verifyCodeExpires = null;
  await user.save();
  await linkClientDeals(user).catch(() => {});
  return { verified: true };
}

/**
 * Once a client proves they own an email, attach them to any open deals whose
 * contact has that email, so their quotes/projects show in the portal without
 * an admin linking them by hand. Only unowned deals, only verified emails.
 */
export async function linkClientDeals(user) {
  const memberships = await Membership.find({ userId: user._id, role: 'client' }).lean();
  let linked = 0;
  for (const m of memberships) {
    const contacts = await Contact.find({ workspaceId: m.workspaceId, email: String(user.email).toLowerCase() }).select('_id').lean();
    if (!contacts.length) continue;
    const r = await Deal.updateMany(
      { workspaceId: m.workspaceId, contactId: { $in: contacts.map((c) => c._id) }, clientUserId: null },
      { $set: { clientUserId: user._id } },
    );
    linked += r.modifiedCount ?? 0;
  }
  return linked;
}

export async function login({ email, password, totp, userAgent, ip }) {
  const user = await User.findOne({ email }).select(
    '+passwordHash +failedLogins +lockedUntil +totpSecret +totpEnabledAt',
  );
  if (!user) throw ApiError.unauthorized('Invalid credentials');
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw ApiError.tooMany('Account temporarily locked');
  }
  const okPw = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!okPw) {
    user.failedLogins = (user.failedLogins ?? 0) + 1;
    if (user.failedLogins >= MAX_FAILED) user.lockedUntil = new Date(Date.now() + LOCK_MS);
    await user.save();
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (!user.emailVerifiedAt) throw ApiError.forbidden('Email not verified');

  const membership = await Membership.findOne({ userId: user._id, status: 'active' });
  if (!membership) throw ApiError.forbidden('No active membership');

  // Admins must present a valid TOTP once 2FA is *confirmed*. A secret from an
  // unfinished setup (totpEnabledAt null) must not lock the account.
  const isAdmin = ['super_admin', 'admin'].includes(membership.role);
  if (isAdmin && user.totpSecret && user.totpEnabledAt) {
    if (!totp) throw ApiError.unauthorized('2FA required', { code: 'TOTP_REQUIRED' });
    const valid = authenticator.verify({ token: totp, secret: decrypt(user.totpSecret) });
    if (!valid) throw ApiError.unauthorized('Invalid 2FA code');
  }

  user.failedLogins = 0;
  user.lockedUntil = null;
  await user.save();
  if (membership.role === 'client' && user.emailVerifiedAt) await linkClientDeals(user).catch(() => {});

  const refreshToken = await withTransaction((s) => issueRefresh(user, { userAgent, ip }, s));
  return {
    accessToken: signAccess(user, membership),
    refreshToken,
    user: { id: user._id, name: user.name, email: user.email, role: membership.role },
  };
}

/** Rotate a refresh token. Reuse of a retired token revokes the whole family. */
export async function refresh({ refreshToken, userAgent, ip }) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }
  return withTransaction(async (session) => {
    const active = await Session.findOne({
      userId: payload.sub,
      familyId: payload.familyId,
      revokedAt: null,
    }).session(session);

    if (!active || active.tokenHash !== sha256(payload.raw)) {
      // Reuse detected (or unknown): revoke the family.
      await Session.updateMany(
        { userId: payload.sub, familyId: payload.familyId },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      throw ApiError.unauthorized('Refresh token reuse detected');
    }

    active.revokedAt = new Date();
    await active.save({ session });

    const user = await User.findById(payload.sub).session(session);
    const membership = await Membership.findOne({ userId: user._id, status: 'active' }).session(session);
    const newRefresh = await issueRefresh(user, { userAgent, ip }, session);
    return { accessToken: signAccess(user, membership), refreshToken: newRefresh };
  });
}

export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ email });
  // Always succeed to avoid leaking which emails exist.
  if (!user) return { requested: true };
  const raw = crypto.randomBytes(32).toString('hex');
  user.resetTokenHash = sha256(raw);
  user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  await sendPasswordReset(email, `${env.WEB_ORIGIN}/reset?token=${raw}&email=${encodeURIComponent(email)}`);
  return { requested: true };
}

export async function resetPassword({ email, token, password }) {
  const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpires');
  if (!user?.resetTokenHash || user.resetTokenExpires < new Date()) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }
  if (user.resetTokenHash !== sha256(token)) throw ApiError.badRequest('Invalid reset token');
  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  await user.save();
  // Revoke all sessions on password change.
  await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return { reset: true };
}

/** Begin TOTP enrolment: returns an otpauth URL to show as a QR code. */
export async function setupTotp({ userId }) {
  const user = await User.findById(userId);
  const secret = authenticator.generateSecret();
  user.totpSecret = encrypt(secret);
  await user.save();
  const otpauth = authenticator.keyuri(user.email, 'Klyro', secret);
  return { otpauth };
}

export async function confirmTotp({ userId, token }) {
  const user = await User.findById(userId).select('+totpSecret');
  if (!user?.totpSecret) throw ApiError.badRequest('No TOTP setup in progress');
  if (!authenticator.verify({ token, secret: decrypt(user.totpSecret) })) {
    throw ApiError.badRequest('Invalid 2FA code');
  }
  user.totpEnabledAt = new Date();
  await user.save();
  return { enabled: true };
}

/**
 * F44 — request a magic login link. Always returns success (no user
 * enumeration). Emails a one-time link valid 15 minutes.
 */
export async function requestMagicLink({ email }) {
  const user = await User.findOne({ email });
  if (!user) return { requested: true };
  const raw = crypto.randomBytes(32).toString('hex');
  user.magicTokenHash = sha256(raw);
  user.magicTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();
  const link = `${env.PORTAL_ORIGIN}/magic?token=${raw}&email=${encodeURIComponent(email)}`;
  await sendTransactional({
    to: email,
    subject: 'Your Klyro login link',
    htmlContent: `<p>Click to sign in (valid 15 minutes): <a href="${link}">${link}</a></p>`,
  }).catch(() => {});
  return { requested: true };
}

/** F44 — consume a magic link and issue tokens (like login). */
export async function loginWithMagicLink({ email, token, userAgent, ip }) {
  const user = await User.findOne({ email }).select('+magicTokenHash +magicTokenExpires');
  if (!user?.magicTokenHash || user.magicTokenExpires < new Date()) {
    throw ApiError.badRequest('Invalid or expired link');
  }
  if (user.magicTokenHash !== sha256(token)) throw ApiError.badRequest('Invalid link');
  user.magicTokenHash = null;
  user.magicTokenExpires = null;
  if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date(); // link proves email ownership
  await user.save();

  const membership = await Membership.findOne({ userId: user._id, status: 'active' });
  if (!membership) throw ApiError.forbidden('No active membership');
  const refreshToken = await withTransaction((s) => issueRefresh(user, { userAgent, ip }, s));
  return {
    accessToken: signAccess(user, membership),
    refreshToken,
    user: { id: user._id, name: user.name, email: user.email, role: membership.role },
  };
}
