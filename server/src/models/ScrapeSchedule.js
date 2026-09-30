import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// A scheduled job ("cron job") that runs saved lead searches automatically.
const scrapeScheduleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: true, index: true },
  // When it runs.
  frequency: {
    type: { type: String, enum: ['interval', 'daily', 'weekly', 'monthly', 'cron'], default: 'daily' },
    everyMinutes: { type: Number, default: 60 }, // interval
    times: { type: [String], default: ['09:00'] }, // daily/weekly/monthly, "HH:mm"
    days: { type: [Number], default: [1, 2, 3, 4, 5] }, // weekly, 0 = Sunday
    dayOfMonth: { type: Number, default: 1 }, // monthly
    cron: { type: String }, // cron: 5-field expression
  },
  timezone: { type: String, default: 'Asia/Kolkata' },
  // What it runs: every search in some categories, or hand-picked searches.
  mode: { type: String, enum: ['group', 'pick'], default: 'group' },
  source: { type: String, enum: ['maps', 'reddit', 'any'], default: 'any' },
  groups: { type: [String], default: [] }, // empty = all categories
  targetIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'ScrapeTarget', default: [] },
  perRun: { type: Number, default: 1 }, // searches per run (oldest first); 0 = all
  maxResults: { type: Number }, // optional override per search
  // State.
  nextRunAt: { type: Date, index: true },
  lastRunAt: { type: Date },
  lastResult: { type: mongoose.Schema.Types.Mixed },
  runCount: { type: Number, default: 0 },
  lockedUntil: { type: Date }, // claim while firing (multi-process safe)
  heartbeatAt: { type: Date }, // set while its searches are running
});
scrapeScheduleSchema.plugin(basePlugin, { softDelete: true });
// The minute tick: enabled schedules that are due.
scrapeScheduleSchema.index({ enabled: 1, nextRunAt: 1 });

export const ScrapeSchedule = mongoose.model('ScrapeSchedule', scrapeScheduleSchema);
