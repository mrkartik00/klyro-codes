import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  emailVerifiedAt: { type: Date, default: null },
  // Email verification OTP (hashed) + expiry.
  verifyCodeHash: { type: String, default: null, select: false },
  verifyCodeExpires: { type: Date, default: null, select: false },
  // Password reset token (hashed) + expiry.
  resetTokenHash: { type: String, default: null, select: false },
  resetTokenExpires: { type: Date, default: null, select: false },
  // TOTP 2FA.
  totpSecret: { type: String, default: null, select: false }, // encrypted
  totpEnabledAt: { type: Date, default: null },
  // Brute-force lockout.
  failedLogins: { type: Number, default: 0, select: false },
  lockedUntil: { type: Date, default: null, select: false },
});
userSchema.plugin(basePlugin, { tenant: false, softDelete: true });

export const User = mongoose.model('User', userSchema);
