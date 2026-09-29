import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// One document per active refresh-token family. Rotation replaces tokenHash;
// reuse of a retired token revokes the whole family (reuse detection).
const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true },
  userAgent: { type: String },
  ip: { type: String },
  revokedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});
sessionSchema.plugin(basePlugin, { tenant: false });
// TTL cleanup once expired.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
