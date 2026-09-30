import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const approvalSchema = new mongoose.Schema({
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  stepOrder: { type: Number },
  channel: { type: String, default: 'email' },
  draft: {
    subject: { type: String },
    body: { type: String },
    personalizationNotes: { type: String },
  },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt: { type: Date },
});
approvalSchema.plugin(basePlugin);
// Approvals queue (pending, newest first) and per-lead lookups.
approvalSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
approvalSchema.index({ workspaceId: 1, leadId: 1, status: 1 });

export const Approval = mongoose.model('Approval', approvalSchema);
