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
  { source: 'freelancer', group: 'Freelancer.com', name: 'Freelancer — websites & web apps', keywords: ['website', 'web app', 'wordpress', 'shopify', 'ecommerce', 'landing page'], filters: { minBudgetUsd: 250, maxBids: 60, maxAgeDays: 2, minIntent: 0.5, maxChecks: 20 } },
  { source: 'freelancer', group: 'Freelancer.com', name: 'Freelancer — mobile apps', keywords: ['mobile app', 'android app', 'ios app', 'flutter', 'react native'], filters: { minBudgetUsd: 300, maxBids: 60, maxAgeDays: 2, minIntent: 0.5, maxChecks: 15 } },
  { source: 'freelancer', group: 'Freelancer.com', name: 'Freelancer — big projects ($1.5k+)', keywords: ['website', 'app', 'platform', 'saas', 'marketplace'], filters: { minBudgetUsd: 1500, maxBids: 100, maxAgeDays: 3, minIntent: 0.5, maxChecks: 15 } },
  { source: 'hackernews', group: 'Hacker News', name: 'HN — seeking freelancer & founders', keywords: [], filters: { maxAgeDays: 7, minIntent: 0.6 } },
  { source: 'tenders', group: 'Public tenders', name: 'Tenders — UK websites & software', keywords: [], maxResults: 40, filters: { maxAgeDays: 3, minIntent: 0.5 } },
  { source: 'bluesky', group: 'Social networks', name: 'Bluesky — people hiring a developer', keywords: SOCIAL, filters: { maxAgeDays: 2, minIntent: 0.6 } },
  // Brave: public RFPs (US councils, nonprofits, schools…) are the best yield; LinkedIn/X posts are thin in its index.
  { source: 'brave', group: 'Public tenders', name: 'RFPs — website redesign & development (web search)', keywords: ['"request for proposals" website redesign', '"request for proposals" "website development"', 'RFP "website redesign"', '"request for proposal" "mobile app development"', '"seeking proposals" website'], filters: { sites: ['*'], freshness: 'pm', maxQueries: 5, minIntent: 0.6, maxAgeDays: 45 } },
  { source: 'brave', group: 'Social networks', name: 'LinkedIn — posts asking for a developer', keywords: SOCIAL.slice(0, 2), filters: { sites: ['linkedin.com/posts'], freshness: 'pm', maxQueries: 2, minIntent: 0.6 } },
  { source: 'brave', group: 'Social networks', name: 'X — posts asking for a developer', keywords: SOCIAL.slice(0, 2), filters: { sites: ['x.com'], freshness: 'pm', maxQueries: 2, minIntent: 0.6 } },
  { source: 'brave', group: 'Social networks', name: 'Threads, Facebook, Quora, Indie Hackers — web search', keywords: SOCIAL.slice(0, 2), filters: { sites: ['threads.net', 'facebook.com', 'quora.com', 'indiehackers.com'], freshness: 'pm', maxQueries: 4, minIntent: 0.6 } },
  { source: 'x', group: 'Social networks', name: 'X API — people hiring (paid, capped)', keywords: SOCIAL, filters: { minIntent: 0.6 }, pausedByDefault: true },
  { source: 'companieshouse', group: 'New businesses', name: 'New UK companies — local services', keywords: [], maxResults: 60, filters: { days: 3 } },
];

for (const p of PRESETS) {
  const { pausedByDefault, ...rest } = p;
  const active = !pausedByDefault && missingKeys(p.source).length === 0;
  await ScrapeTarget.updateOne(
    { workspaceId: ws._id, name: p.name, deletedAt: null },
    { $set: { workspaceId: ws._id, maxResults: 25, country: 'GB', ...rest, ...(active ? { active: true } : {}) }, $setOnInsert: { createdBy: admin?._id, ...(active ? {} : { active: false }) } },
    { upsert: true },
  );
  console.log(`${active ? 'on ' : 'off'} ${p.source.padEnd(15)} ${p.name}${missingKeys(p.source).length ? `  (needs ${missingKeys(p.source).join(', ')})` : ''}`);
}

// Retired: too many AI checks for the free Gemini quota.
await ScrapeTarget.updateMany({ workspaceId: ws._id, name: 'Threads, Facebook, Quora — web search', deletedAt: null }, { $set: { deletedAt: new Date(), active: false } });
await ScrapeSchedule.updateMany({ workspaceId: ws._id, name: { $in: ['Freelancer.com — every 30 min', 'LinkedIn / X / Threads web search — 06:30 & 18:30'] }, deletedAt: null }, { $set: { deletedAt: new Date(), enabled: false } });
const SCHEDULES = [
  { name: 'Freelancer.com — every 2 hours', source: 'freelancer', perRun: 0, frequency: { type: 'interval', everyMinutes: 120 } },
  { name: 'Hacker News — every 6 hours', source: 'hackernews', perRun: 0, frequency: { type: 'interval', everyMinutes: 360 } },
  { name: 'Public tenders — daily 06:00', source: 'tenders', perRun: 0, frequency: { type: 'daily', times: ['06:00'] } },
  { name: 'Bluesky — every 2 hours', source: 'bluesky', perRun: 0, frequency: { type: 'interval', everyMinutes: 120 } },
  // Two Brave keys ≈ 1,900 searches/month: 4 presets × 13 queries × 4 runs/day ≈ 1,560.
  { name: 'Web search (RFPs, LinkedIn, X, Threads) — 4× daily', source: 'brave', perRun: 0, frequency: { type: 'daily', times: ['00:30', '06:30', '12:30', '18:30'] } },
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
