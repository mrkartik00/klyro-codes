import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// Append-only analytics events with a 180-day TTL. Rolled up into metrics_daily.
const eventSchema = new mongoose.Schema({
  type: { type: String, required: true, index: true }, // sent | delivered | opened | replied | positive | meeting | won
  channel: { type: String, default: 'email' },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  city: { type: String },
  category: { type: String },
  valueMinor: { type: Number },
  currency: { type: String },
  at: { type: Date, default: Date.now },
});
eventSchema.plugin(basePlugin);
eventSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const Event = mongoose.model('Event', eventSchema);
