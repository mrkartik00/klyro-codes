import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// Pre-aggregated daily metrics for fast dashboards. Upserted by the rollup job.
const metricDailySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  channel: { type: String, default: 'email' },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
  type: { type: String, required: true },
  count: { type: Number, default: 0 },
  valueMinor: { type: Number, default: 0 },
});
metricDailySchema.plugin(basePlugin);
metricDailySchema.index({ workspaceId: 1, date: 1, channel: 1, campaignId: 1, type: 1 }, { unique: true });

export const MetricDaily = mongoose.model('MetricDaily', metricDailySchema);
