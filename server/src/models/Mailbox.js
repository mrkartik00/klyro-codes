import mongoose from 'mongoose';
import { MAILBOX_STATUSES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const mailboxSchema = new mongoose.Schema({
  address: { type: String, required: true, lowercase: true, trim: true },
  displayName: { type: String },
  provider: { type: String, enum: ['google', 'zoho', 'smtp'], default: 'google' },
  n8nBranchId: { type: String, default: null }, // which Gmail node in send-via-mailbox
  status: { type: String, enum: MAILBOX_STATUSES, default: 'warming', index: true },
  dailyCap: { type: Number, default: 5 },
  sentToday: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: null },
  warmupStartedAt: { type: Date, default: null },
  // Rolling health (updated by mailboxHealth.service).
  bounceRate: { type: Number, default: 0 },
  complaintRate: { type: Number, default: 0 },
});
mailboxSchema.plugin(basePlugin);
mailboxSchema.index({ workspaceId: 1, address: 1 }, { unique: true });

export const Mailbox = mongoose.model('Mailbox', mailboxSchema);
