import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const scrapeTargetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: { type: String, required: true },
  cities: { type: [String], default: [] },
  categories: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  radiusKm: { type: Number, default: 10 },
  filters: {
    minRating: { type: Number },
    maxRating: { type: Number },
    minReviews: { type: Number },
    hasWebsite: { type: Boolean }, // true = only with, false = only without
    excludeChains: { type: Boolean, default: true },
  },
  maxResults: { type: Number, default: 200 },
  schedule: { type: String, enum: ['once', 'daily', 'weekly'], default: 'once' },
  active: { type: Boolean, default: true },
});
scrapeTargetSchema.plugin(basePlugin, { softDelete: true });

const scrapeJobSchema = new mongoose.Schema({
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapeTarget', index: true },
  status: {
    type: String,
    enum: ['queued', 'running', 'ingesting', 'enriched', 'failed'],
    default: 'queued',
    index: true,
  },
  found: { type: Number, default: 0 },
  ingested: { type: Number, default: 0 },
  error: { type: String },
  startedAt: { type: Date },
  finishedAt: { type: Date },
});
scrapeJobSchema.plugin(basePlugin);

export const ScrapeTarget = mongoose.model('ScrapeTarget', scrapeTargetSchema);
export const ScrapeJob = mongoose.model('ScrapeJob', scrapeJobSchema);
