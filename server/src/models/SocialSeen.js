import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// Posts the AI already judged as not a buyer, so repeated scans don't pay to
// classify them again. Expires after 45 days.
const socialSeenSchema = new mongoose.Schema({
  externalId: { type: String, required: true },
  role: { type: String },
  intent: { type: Number },
  seenAt: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 * 45 },
});
socialSeenSchema.plugin(basePlugin);
socialSeenSchema.index({ workspaceId: 1, externalId: 1 }, { unique: true });

export const SocialSeen = mongoose.model('SocialSeen', socialSeenSchema);
