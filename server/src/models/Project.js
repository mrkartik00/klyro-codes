import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const projectSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', index: true },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  clientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true },
  status: { type: String, enum: ['active', 'on_hold', 'delivered', 'closed'], default: 'active', index: true },
  progressPct: { type: Number, default: 0 },
  stagingUrl: { type: String },
});
projectSchema.plugin(basePlugin, { softDelete: true });

const milestoneSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 },
  amountMinor: { type: Number, default: 0 },
  currency: { type: String, enum: ['USD', 'GBP', 'INR'], default: 'USD' },
  status: { type: String, enum: ['pending', 'in_progress', 'delivered', 'approved'], default: 'pending', index: true },
  approvedAt: { type: Date },
});
milestoneSchema.plugin(basePlugin);

export const Project = mongoose.model('Project', projectSchema);
export const Milestone = mongoose.model('Milestone', milestoneSchema);
