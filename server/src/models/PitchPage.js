import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const pitchPageSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  slug: { type: String, required: true, lowercase: true },
  token: { type: String, required: true }, // unguessable access token
  businessName: { type: String },
  logoUrl: { type: String },
  sections: { type: mongoose.Schema.Types.Mixed }, // audit findings, case studies, demos
  firstViewedAt: { type: Date, default: null },
  viewCount: { type: Number, default: 0 },
});
pitchPageSchema.plugin(basePlugin, { softDelete: true });
pitchPageSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });

const pitchEventSchema = new mongoose.Schema({
  pitchPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'PitchPage', index: true },
  sessionId: { type: String },
  type: { type: String, enum: ['view', 'scroll', 'section', 'cta_click'], required: true },
  section: { type: String },
  scrollDepth: { type: Number },
});
pitchEventSchema.plugin(basePlugin);

export const PitchPage = mongoose.model('PitchPage', pitchPageSchema);
export const PitchEvent = mongoose.model('PitchEvent', pitchEventSchema);
