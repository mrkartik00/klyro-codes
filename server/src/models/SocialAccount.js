import mongoose from 'mongoose';
import { SOCIAL_ACCOUNT_STATUSES, SOCIAL_CHANNELS } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

/**
 * A connected social account (via Unipile) used to send DMs on a channel.
 * Channel-generic: `channel` is linkedin now, instagram/whatsapp later.
 * Mirrors Mailbox: an atomic $inc on sentToday under dailyCap serialises
 * concurrent send claims so the cap can never be exceeded. `sendGapMs`
 * enforces spacing between sends (the worker checks lastSentAt).
 */
const socialAccountSchema = new mongoose.Schema({
  channel: { type: String, enum: SOCIAL_CHANNELS, required: true, index: true },
  provider: { type: String, enum: ['unipile'], default: 'unipile' },
  // Unipile account used to SEND from, and (optionally) a separate one to PULL profiles.
  accountId: { type: String, required: true },
  pullAccountId: { type: String, default: null },
  displayName: { type: String },
  profileUrl: { type: String },
  status: { type: String, enum: SOCIAL_ACCOUNT_STATUSES, default: 'paused', index: true },
  dailyCap: { type: Number, default: 20 },
  sentToday: { type: Number, default: 0 },
  sendGapMs: { type: Number, default: 300000 }, // 5-minute spacing between sends
  lastSentAt: { type: Date, default: null },
});
socialAccountSchema.plugin(basePlugin);
socialAccountSchema.index({ workspaceId: 1, channel: 1, accountId: 1 }, { unique: true });

export const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);
