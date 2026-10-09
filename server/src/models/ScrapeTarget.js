import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const scrapeTargetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  group: { type: String, trim: true, index: true }, // for arranging searches in the admin (e.g. 'Home services')
  lastRunAt: { type: Date }, // scheduled reddit scans rotate oldest-first
  // maps = Google Maps businesses; reddit = people asking for help (social listening)
  source: { type: String, enum: ['maps', 'reddit', 'freelancer', 'hackernews', 'tenders', 'bluesky', 'brave', 'x', 'companieshouse', 'googleplaces', 'apify'], default: 'maps', index: true },
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
    // Other sources (see services/intent.service.js).
    maxChecks: { type: Number }, // AI checks per run
    minBudgetUsd: { type: Number }, // freelancer
    maxBids: { type: Number }, // freelancer
    sites: { type: [String], default: undefined }, // brave: site filters, ['*'] = whole web
    freshness: { type: String }, // brave: pd | pw | pm | py
    maxQueries: { type: Number }, // brave: searches per run
    sinceId: { type: String }, // x: newest post already read
    days: { type: Number }, // companies house: incorporated in the last N days
    sicCodes: { type: [String], default: undefined }, // companies house
  },
  maxResults: { type: Number, default: 200 },
  schedule: { type: String, enum: ['once', 'daily', 'weekly'], default: 'once' },
  active: { type: Boolean, default: true },
});
scrapeTargetSchema.plugin(basePlugin, { softDelete: true });
// Schedules pick the searches that ran longest ago in a source/category.
scrapeTargetSchema.index({ workspaceId: 1, source: 1, group: 1, active: 1, lastRunAt: 1 });

const scrapeJobSchema = new mongoose.Schema({
  scrapeTargetId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapeTarget', index: true },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapeSchedule', index: true }, // set when started by a schedule
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
  // What the run did, for the run detail view (capped).
  log: { type: [String], default: [] },
  stats: { type: mongoose.Schema.Types.Mixed, default: {} },
  startedAt: { type: Date },
  finishedAt: { type: Date },
});
scrapeJobSchema.plugin(basePlugin);
// Run lists (newest first, by search / status) and the stale-run sweep.
scrapeJobSchema.index({ workspaceId: 1, scrapeTargetId: 1, createdAt: -1 });
scrapeJobSchema.index({ workspaceId: 1, status: 1, updatedAt: 1 });

export const ScrapeTarget = mongoose.model('ScrapeTarget', scrapeTargetSchema);
export const ScrapeJob = mongoose.model('ScrapeJob', scrapeJobSchema);
