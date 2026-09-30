import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const scrapeTargetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // maps = Google Maps businesses; reddit = people asking for help (social listening)
  source: { type: String, enum: ['maps', 'reddit'], default: 'maps', index: true },
  communities: { type: [String], default: [] }, // reddit: subreddit names without r/
  country: { type: String, default: 'US' },
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
    minIntent: { type: Number }, // reddit: 0-1, keep posts at/above this buying intent
    maxAgeDays: { type: Number }, // reddit: ignore older posts
    cursor: { type: Number }, // reddit: next subreddit to scan (round-robin)
  },
  maxResults: { type: Number, default: 200 },
  schedule: { type: String, enum: ['once', 'daily', 'weekly'], default: 'once' },
  active: { type: Boolean, default: true },
});
scrapeTargetSchema.plugin(basePlugin, { softDelete: true });

const scrapeJobSchema = new mongoose.Schema({
  scrapeTargetId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapeTarget', index: true },
  status: {
    type: String,
    enum: ['queued', 'running', 'ingesting', 'enriched', 'failed'],
    default: 'queued',
    index: true,
  },
  requested: { type: Number, default: 0 },
  found: { type: Number, default: 0 },
  ingested: { type: Number, default: 0 },
  progressPct: { type: Number, default: 0 },
  error: { type: String },
  startedAt: { type: Date },
  finishedAt: { type: Date },
});
scrapeJobSchema.plugin(basePlugin);

export const ScrapeTarget = mongoose.model('ScrapeTarget', scrapeTargetSchema);
export const ScrapeJob = mongoose.model('ScrapeJob', scrapeJobSchema);
