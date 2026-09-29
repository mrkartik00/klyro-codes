import mongoose from 'mongoose';
import { SUPPRESSION_TYPES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

// Global do-not-contact list, checked before every send.
const suppressionSchema = new mongoose.Schema({
  type: { type: String, enum: SUPPRESSION_TYPES, required: true },
  value: { type: String, required: true, lowercase: true, trim: true },
  reason: { type: String }, // unsubscribe | bounce | complaint | manual
});
suppressionSchema.plugin(basePlugin);
suppressionSchema.index({ workspaceId: 1, type: 1, value: 1 }, { unique: true });

export const Suppression = mongoose.model('Suppression', suppressionSchema);
