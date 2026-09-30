// Preset searches for the non-Reddit, non-Maps sources + their schedules.
// Idempotent by name:  cd server && node --env-file=.env scripts/seed-intent-presets.mjs
// Sources needing a key are created PAUSED when the key is missing.
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const { Workspace } = await import('../src/models/Workspace.js');
const { User } = await import('../src/models/User.js');
const { ScrapeTarget } = await import('../src/models/ScrapeTarget.js');
const { ScrapeSchedule } = await import('../src/models/ScrapeSchedule.js');
const { nextRunTime } = await import('../src/services/schedule.service.js');
const { missingKeys } = await import('../src/services/intent.service.js');

const ws = await Workspace.findOne().sort({ createdAt: 1 });
const admin = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });

const SOCIAL = ['looking for a developer', 'need a website built', 'need an app built', 'looking for an app developer', 'looking for a web designer', 'recommend a developer'];
const PRESETS = [
  { source: 'freelancer', group: 'Freelancer.com', name: 'Freelancer — websites & web apps', keywords: ['website', 'web app', 'wordpress', 'shopify', 'ecommerce', 'landing page'], filters: { minBudgetUsd: 250, maxBids: 60, maxAgeDays: 2, minIntent: 0.5 } },
  { source: 'freelancer', group: 'Freelancer.com', name: 'Freelancer — mobile apps', keywords: ['mobile app', 'android app', 'ios app', 'flutter', 'react native'], filters: { minBudgetUsd: 300, maxBids: 60, maxAgeDays: 2, minIntent: 0.5 } },
  { source: 'freelancer', group: 'Freelancer.com', name: 'Freelancer — big projects ($1.5k+)', keywords: ['website', 'app', 'platform', 'saas', 'marketplace'], filters: { minBudgetUsd: 1500, maxBids: 100, maxAgeDays: 3, minIntent: 0.5 } },
  { source: 'hackernews', group: 'Hacker News', name: 'HN — seeking freelancer & founders', keywords: [], filters: { maxAgeDays: 7, minIntent: 0.6 } },
  { source: 'tenders', group: 'Public tenders', name: 'Tenders — UK websites & software', keywords: [], maxResults: 40, filters: { maxAgeDays: 3, minIntent: 0.5 } },
  { source: 'bluesky', group: 'Social networks', name: 'Bluesky — people hiring a developer', keywords: SOCIAL, filters: { maxAgeDays: 2, minIntent: 0.6 } },
  { source: 'brave', group: 'Social networks', name: 'LinkedIn — posts asking for a developer', keywords: SOCIAL.slice(0, 4), filters: { sites: ['linkedin.com/posts'], maxQueries: 4, minIntent: 0.6 } },
  { source: 'brave', group: 'Social networks', name: 'X — posts asking for a developer', keywords: SOCIAL.slice(0, 4), filters: { sites: ['x.com'], maxQueries: 4, minIntent: 0.6 } },
  { source: 'brave', group: 'Social networks', name: 'Threads, Facebook, Quora — web search', keywords: SOCIAL.slice(0, 3), filters: { sites: ['threads.net', 'facebook.com', 'quora.com'], maxQueries: 6, minIntent: 0.6 } },
  { source: 'x', group: 'Social networks', name: 'X API — people hiring (paid, capped)', keywords: SOCIAL, filters: { minIntent: 0.6 }, pausedByDefault: true },
  { source: 'companieshouse', group: 'New businesses', name: 'New UK companies — local services', keywords: [], maxResults: 60, filters: { days: 3 } },
];

for (const p of PRESETS) {
  const { pausedByDefault, ...rest } = p;
  const active = !pausedByDefault && missingKeys(p.source).length === 0;
  await ScrapeTarget.updateOne(
    { workspaceId: ws._id, name: p.name, deletedAt: null },
    { $set: { workspaceId: ws._id, maxResults: 25, country: 'GB', ...rest }, $setOnInsert: { createdBy: admin?._id, active } },
    { upsert: true },
  );
  console.log(`${active ? 'on ' : 'off'} ${p.source.padEnd(15)} ${p.name}${missingKeys(p.source).length ? `  (needs ${missingKeys(p.source).join(', ')})` : ''}`);
}

const SCHEDULES = [
  { name: 'Freelancer.com — every 30 min', source: 'freelancer', perRun: 0, frequency: { type: 'interval', everyMinutes: 30 } },
  { name: 'Hacker News — every 6 hours', source: 'hackernews', perRun: 0, frequency: { type: 'interval', everyMinutes: 360 } },
  { name: 'Public tenders — daily 06:00', source: 'tenders', perRun: 0, frequency: { type: 'daily', times: ['06:00'] } },
  { name: 'Bluesky — every 2 hours', source: 'bluesky', perRun: 0, frequency: { type: 'interval', everyMinutes: 120 } },
  // Brave free credit ≈ 1,000 searches/month: 3 presets × ~5 queries × 2/day ≈ 900.
  { name: 'LinkedIn / X / Threads web search — 06:30 & 18:30', source: 'brave', perRun: 0, frequency: { type: 'daily', times: ['06:30', '18:30'] } },
  { name: 'X API — every 3 hours (paid, capped)', source: 'x', perRun: 0, frequency: { type: 'interval', everyMinutes: 180 } },
  { name: 'New UK companies — daily 05:30', source: 'companieshouse', perRun: 0, frequency: { type: 'daily', times: ['05:30'] } },
];
for (const s of SCHEDULES) {
  const doc = { workspaceId: ws._id, mode: 'group', groups: [], timezone: 'Asia/Kolkata', ...s };
  const existing = await ScrapeSchedule.findOne({ workspaceId: ws._id, name: s.name, deletedAt: null });
  const sched = existing || new ScrapeSchedule({ ...doc, createdBy: admin?._id, enabled: true });
  Object.assign(sched, doc);
  sched.nextRunAt = nextRunTime(sched);
  await sched.save();
  console.log(`schedule  ${s.name} → next ${sched.nextRunAt.toISOString().slice(0, 16)}Z`);
}
await mongoose.disconnect();
