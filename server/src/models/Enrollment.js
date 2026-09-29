import mongoose from 'mongoose';
import { ENROLLMENT_STATUSES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const enrollmentSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active', index: true },
  currentStep: { type: Number, default: 0 },
  nextDueAt: { type: Date, default: null, index: true },
  threadId: { type: String, default: null }, // Gmail thread for reply matching
  lastMessageId: { type: String, default: null },
});
enrollmentSchema.plugin(basePlugin);
enrollmentSchema.index({ workspaceId: 1, campaignId: 1, leadId: 1 }, { unique: true });

export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
