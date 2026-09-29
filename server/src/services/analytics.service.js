import { Event } from '../models/Event.js';
import { MetricDaily } from '../models/MetricDaily.js';

/** Record an analytics event (append-only). Session-aware so it can join a txn. */
export async function recordEvent(
  { workspaceId, type, channel = 'email', campaignId, mailboxId, leadId, city, category, valueMinor, currency },
  session,
) {
  const [doc] = await Event.create(
    [{ workspaceId, type, channel, campaignId, mailboxId, leadId, city, category, valueMinor, currency, at: new Date() }],
    session ? { session, ordered: true } : {},
  );
  return doc;
}

const FUNNEL = ['sent', 'delivered', 'opened', 'clicked', 'replied', 'positive', 'meeting', 'won'];

/** Aggregate the funnel over a date range, optionally by campaign/channel. */
export async function funnel({ workspaceId, from, to, campaignId, channel }) {
  const match = { workspaceId, at: {} };
  if (from) match.at.$gte = new Date(from);
  if (to) match.at.$lte = new Date(to);
  if (!from && !to) delete match.at;
  if (campaignId) match.campaignId = campaignId;
  if (channel) match.channel = channel;

  const rows = await Event.aggregate([{ $match: match }, { $group: { _id: '$type', count: { $sum: 1 } } }]);
  const counts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  return FUNNEL.map((stage) => ({ stage, count: counts[stage] ?? 0 }));
}

/** Roll up a single day's events into metrics_daily (idempotent upsert). */
export async function rollupDay({ workspaceId, date = new Date() }) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  const rows = await Event.aggregate([
    { $match: { workspaceId, at: { $gte: day, $lt: next } } },
    {
      $group: {
        _id: { channel: '$channel', campaignId: '$campaignId', type: '$type' },
        count: { $sum: 1 },
        value: { $sum: { $ifNull: ['$valueMinor', 0] } },
      },
    },
  ]);
  for (const r of rows) {
    await MetricDaily.findOneAndUpdate(
      { workspaceId, date: day, channel: r._id.channel, campaignId: r._id.campaignId ?? null, type: r._id.type },
      { $set: { count: r.count, valueMinor: r.value } },
      { upsert: true },
    );
  }
  return { day, groups: rows.length };
}
