// Recommended scrape schedules. Idempotent by name (updates settings, keeps
// run history). Re-run after changing:
//   cd server && node --env-file=.env scripts/seed-schedules.mjs
// Times are India time (admin's clock). Maps runs at night when the VPS is idle;
// Reddit rotates small batches all day to stay under its rate limit.
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const { Workspace } = await import('../src/models/Workspace.js');
const { User } = await import('../src/models/User.js');
const { ScrapeSchedule } = await import('../src/models/ScrapeSchedule.js');
const { nextRunTime, validateFrequency } = await import('../src/services/schedule.service.js');

const ws = await Workspace.findOne().sort({ createdAt: 1 });
if (!ws) throw new Error('No workspace yet — register the first admin first.');
const admin = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });

const TZ = 'Asia/Kolkata';
// Overnight plan (India time) so the 07:30 digest has the best fresh leads:
// Reddit all day (fast via Arctic Shift; judged posts are cached so repeat
// scans are cheap), every Maps category nightly between 00:30 and 04:30.
const MAPS_CAP = 40; // leads per Maps search — keeps overnight enrichment finishing by morning
const SCHEDULES = [
  { name: 'Reddit — hiring boards (every 30 min)', source: 'reddit', groups: ['Hiring boards'], perRun: 0, frequency: { type: 'interval', everyMinutes: 30 } },
  {
    name: 'Reddit — buyer searches (every 2 hours)',
    source: 'reddit',
    groups: ['Founders & startups', 'Small businesses', 'E-commerce', 'Industries', 'General'],
    perRun: 0,
    frequency: { type: 'interval', everyMinutes: 120 },
  },
  { name: 'Maps — home services (nightly 00:30)', source: 'maps', groups: ['Home services'], perRun: 3, maxResults: MAPS_CAP, frequency: { type: 'daily', times: ['00:30'] } },
  { name: 'Maps — health & wellness (nightly 01:30)', source: 'maps', groups: ['Health & wellness'], perRun: 2, maxResults: MAPS_CAP, frequency: { type: 'daily', times: ['01:30'] } },
  { name: 'Maps — professional services (nightly 02:15)', source: 'maps', groups: ['Professional services'], perRun: 1, maxResults: MAPS_CAP, frequency: { type: 'daily', times: ['02:15'] } },
  { name: 'Maps — fitness, beauty & food (nightly 02:45)', source: 'maps', groups: ['Fitness & beauty', 'Food & retail'], perRun: 2, maxResults: MAPS_CAP, frequency: { type: 'daily', times: ['02:45'] } },
  { name: 'Maps — auto & education (nightly 03:30)', source: 'maps', groups: ['Auto & education'], perRun: 1, maxResults: MAPS_CAP, frequency: { type: 'daily', times: ['03:30'] } },
  { name: 'Maps — United Kingdom (nightly 04:00)', source: 'maps', groups: ['United Kingdom'], perRun: 1, maxResults: MAPS_CAP, frequency: { type: 'daily', times: ['04:00'] } },
  { name: 'Maps — my own searches (Sun 04:30)', source: 'maps', groups: ['My searches'], perRun: 0, frequency: { type: 'weekly', days: [0], times: ['04:30'] } },
];
// Earlier versions of this plan (replaced above).
const RETIRED = [
  'Reddit — hiring boards (hourly)',
  'Reddit — buyer searches (rotating, every 30 min)',
  'Maps — home services (nightly)',
  'Maps — health & wellness (nightly)',
  'Maps — fitness, beauty & food (Mon/Wed/Fri)',
  'Maps — professional services (Tue/Thu)',
  'Maps — auto & education (Sat)',
  'Maps — United Kingdom (Tue/Fri)',
  'Maps — my own searches (Sun)',
];
await ScrapeSchedule.updateMany({ workspaceId: ws._id, name: { $in: RETIRED }, deletedAt: null }, { $set: { deletedAt: new Date(), enabled: false } });

let created = 0;
let updated = 0;
for (const s of SCHEDULES) {
  const doc = { mode: 'group', timezone: TZ, enabled: true, ...s };
  validateFrequency(doc.frequency, doc.timezone);
  const existing = await ScrapeSchedule.findOne({ workspaceId: ws._id, name: s.name, deletedAt: null });
  if (existing) {
    Object.assign(existing, doc);
    existing.nextRunAt = nextRunTime(existing);
    await existing.save();
    updated += 1;
  } else {
    const n = new ScrapeSchedule({ workspaceId: ws._id, createdBy: admin?._id, ...doc });
    n.nextRunAt = nextRunTime(n);
    await n.save();
    created += 1;
  }
}
for (const s of await ScrapeSchedule.find({ workspaceId: ws._id, deletedAt: null }).sort({ nextRunAt: 1 }).lean()) {
  console.log(`${s.enabled ? 'on ' : 'off'} ${s.nextRunAt?.toISOString().slice(0, 16)}Z  ${s.name}`);
}
console.log(`schedules: ${created} new · ${updated} updated`);
await mongoose.disconnect();
