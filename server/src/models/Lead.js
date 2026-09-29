import mongoose from 'mongoose';
import { LEAD_STAGES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const leadSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  primaryContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  stage: { type: String, enum: LEAD_STAGES, default: 'new', index: true },
  score: { type: Number, default: 0, index: true },
  scoreBreakdown: { type: mongoose.Schema.Types.Mixed },
  country: { type: String },
  timezone: { type: String },
  tags: { type: [String], default: [] },
  source: { type: String, index: true }, // maps | reddit | linkedin | inbound | import | manual
  auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebsiteAudit' },
  notes: { type: String },
});
leadSchema.plugin(basePlugin, { softDelete: true });
leadSchema.index({ workspaceId: 1, organizationId: 1 }, { unique: true });
leadSchema.index({ workspaceId: 1, score: -1, stage: 1 });

export const Lead = mongoose.model('Lead', leadSchema);
