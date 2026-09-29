import mongoose from 'mongoose';
import { DEAL_STAGES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const dealSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  stage: { type: String, enum: DEAL_STAGES, default: 'new', index: true },
  value: {
    amountMinor: { type: Number, default: 0 },
    currency: { type: String, enum: ['USD', 'GBP', 'INR'], default: 'USD' },
  },
  source: { type: String },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lostReason: { type: String },
});
dealSchema.plugin(basePlugin, { softDelete: true });
dealSchema.index({ workspaceId: 1, stage: 1, updatedAt: -1 });

export const Deal = mongoose.model('Deal', dealSchema);
