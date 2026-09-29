import mongoose from 'mongoose';
import { CHANNELS } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  channel: { type: String, enum: CHANNELS, default: 'email' },
  status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft', index: true },
  // Send window in the lead's local time (24h).
  sendWindow: {
    startHour: { type: Number, default: 9 },
    endHour: { type: Number, default: 17 },
    businessDaysOnly: { type: Boolean, default: true },
  },
});
campaignSchema.plugin(basePlugin, { softDelete: true });

const sequenceStepSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  order: { type: Number, required: true },
  delayDays: { type: Number, default: 0 }, // business days after the previous step
  channel: { type: String, enum: CHANNELS, default: 'email' },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  stopOnReply: { type: Boolean, default: true },
});
sequenceStepSchema.plugin(basePlugin);
sequenceStepSchema.index({ workspaceId: 1, campaignId: 1, order: 1 }, { unique: true });

export const Campaign = mongoose.model('Campaign', campaignSchema);
export const SequenceStep = mongoose.model('SequenceStep', sequenceStepSchema);
