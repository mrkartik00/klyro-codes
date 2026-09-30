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
  source: { type: String, index: true }, // maps | reddit | linkedin | x | inbound | csv | manual
  // The exact post/profile/listing where we found this lead (open to contact them).
  sourceUrl: { type: String },
  // Social-listening context: what they asked for, how strong the buying intent is.
  intent: {
    score: Number, // 0-1 from the AI
    need: String, // one-line summary of what they want
    title: String,
    text: String,
    community: String, // e.g. r/smallbusiness
    author: String, // e.g. u/jane
    postedAt: Date,
    externalId: String, // platform post id (dedupe)
  },
  auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebsiteAudit' },
  notes: { type: String },
});
leadSchema.plugin(basePlugin, { softDelete: true });
leadSchema.index({ workspaceId: 1, organizationId: 1 }, { unique: true });
leadSchema.index({ workspaceId: 1, score: -1, stage: 1 });
// One lead per social post (re-scans never duplicate).
leadSchema.index(
  { workspaceId: 1, 'intent.externalId': 1 },
  { unique: true, partialFilterExpression: { 'intent.externalId': { $type: 'string' } } },
);

export const Lead = mongoose.model('Lead', leadSchema);
