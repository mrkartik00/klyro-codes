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
const SCHEDULES = [
  // Reddit: fresh [Hiring] posts go fast, so check the boards hourly.
  { name: 'Reddit — hiring boards (hourly)', source: 'reddit', groups: ['Hiring boards'], perRun: 1, frequency: { type: 'interval', everyMinutes: 60 } },
  {
    name: 'Reddit — buyer searches (rotating, every 30 min)',
    source: 'reddit',
    groups: ['Founders & startups', 'Small businesses', 'E-commerce', 'Industries', 'General'],
    perRun: 1,
    frequency: { type: 'interval', everyMinutes: 30 },
  },
  // Google Maps: nightly batches, rotating through each category.
  { name: 'Maps — home services (nightly)', source: 'maps', groups: ['Home services'], perRun: 2, frequency: { type: 'daily', times: ['01:00'] } },
  { name: 'Maps — health & wellness (nightly)', source: 'maps', groups: ['Health & wellness'], perRun: 1, frequency: { type: 'daily', times: ['02:30'] } },
  { name: 'Maps — fitness, beauty & food (Mon/Wed/Fri)', source: 'maps', groups: ['Fitness & beauty', 'Food & retail'], perRun: 1, frequency: { type: 'weekly', days: [1, 3, 5], times: ['03:30'] } },
  { name: 'Maps — professional services (Tue/Thu)', source: 'maps', groups: ['Professional services'], perRun: 1, frequency: { type: 'weekly', days: [2, 4], times: ['03:30'] } },
  { name: 'Maps — auto & education (Sat)', source: 'maps', groups: ['Auto & education'], perRun: 1, frequency: { type: 'weekly', days: [6], times: ['03:30'] } },
  { name: 'Maps — United Kingdom (Tue/Fri)', source: 'maps', groups: ['United Kingdom'], perRun: 1, frequency: { type: 'weekly', days: [2, 5], times: ['04:30'] } },
  { name: 'Maps — my own searches (Sun)', source: 'maps', groups: ['My searches'], perRun: 0, frequency: { type: 'weekly', days: [0], times: ['04:30'] } },
];

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
