// Seed Google Places + Apify discovery targets and their schedules so both
// sources run continuously alongside Maps/Reddit/etc. Idempotent by name.
//   cd server && node --env-file=.env scripts/seed-webscrapers.mjs
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const { Workspace } = await import('../src/models/Workspace.js');
const { User } = await import('../src/models/User.js');
const { ScrapeTarget } = await import('../src/models/ScrapeTarget.js');
const { ScrapeSchedule } = await import('../src/models/ScrapeSchedule.js');
const { nextRunTime, validateFrequency } = await import('../src/services/schedule.service.js');

const ws = await Workspace.findOne().sort({ createdAt: 1 });
if (!ws) throw new Error('No workspace yet — register the first admin first.');
const admin = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });
const TZ = 'Asia/Kolkata';

// Categories most likely to need a website / booking system / app.
const US_CITIES = ['Austin, TX', 'Dallas, TX', 'Houston, TX', 'Phoenix, AZ', 'Tampa, FL', 'Charlotte, NC', 'Nashville, TN', 'Denver, CO'];
const UK_CITIES = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol'];
const CATEGORIES = [
  'roofing contractor', 'hvac contractor', 'plumber', 'electrician', 'landscaping', 'remodeling contractor',
  'dentist', 'chiropractor', 'medical spa', 'physiotherapist',
  'law firm', 'accountant', 'real estate agent', 'insurance agency',
  'gym', 'yoga studio', 'hair salon', 'barber shop', 'nail salon', 'spa',
  'restaurant', 'cafe', 'bakery', 'caterer',
  'auto repair', 'driving school', 'tutoring service', 'photographer',
];

// One target per (source × country): the adapter expands categories × cities.
const TARGETS = [
  { name: 'Google Places — US businesses', source: 'googleplaces', group: 'Google Places', country: 'US', cities: US_CITIES, categories: CATEGORIES, maxResults: 60, filters: { maxEmailLookups: 15 } },
  { name: 'Google Places — UK businesses', source: 'googleplaces', group: 'Google Places', country: 'GB', cities: UK_CITIES, categories: CATEGORIES, maxResults: 60, filters: { maxEmailLookups: 15 } },
  { name: 'Apify Maps — US businesses', source: 'apify', group: 'Apify', country: 'US', cities: US_CITIES, categories: CATEGORIES, maxResults: 40, filters: { maxEmailLookups: 15 } },
  { name: 'Apify Maps — UK businesses', source: 'apify', group: 'Apify', country: 'GB', cities: UK_CITIES, categories: CATEGORIES, maxResults: 40, filters: { maxEmailLookups: 15 } },
];

let tCreated = 0;
let tUpdated = 0;
for (const t of TARGETS) {
  const doc = { workspaceId: ws._id, createdBy: admin?._id, active: true, schedule: 'daily', ...t };
  const existing = await ScrapeTarget.findOne({ workspaceId: ws._id, name: t.name, deletedAt: null });
  if (existing) {
    Object.assign(existing, doc);
    await existing.save();
    tUpdated += 1;
  } else {
    await ScrapeTarget.create(doc);
    tCreated += 1;
  }
}

// Schedules: run both new sources several times a day (spread out, India time)
// so they discover leads continuously together with the other sources.
const SCHEDULES = [
  { name: 'Google Places — US & UK (3× daily)', source: 'googleplaces', groups: ['Google Places'], perRun: 2, maxResults: 60, frequency: { type: 'daily', times: ['05:00', '13:00', '21:00'] } },
  { name: 'Apify Maps — US & UK (2× daily)', source: 'apify', groups: ['Apify'], perRun: 1, maxResults: 40, frequency: { type: 'daily', times: ['06:00', '18:00'] } },
];

let sCreated = 0;
let sUpdated = 0;
for (const s of SCHEDULES) {
  const doc = { mode: 'group', timezone: TZ, enabled: true, ...s };
  validateFrequency(doc.frequency, doc.timezone);
  const existing = await ScrapeSchedule.findOne({ workspaceId: ws._id, name: s.name, deletedAt: null });
  const nextRunAt = nextRunTime(doc);
  if (existing) {
    Object.assign(existing, { workspaceId: ws._id, createdBy: admin?._id, nextRunAt, ...doc });
    await existing.save();
    sUpdated += 1;
  } else {
    await ScrapeSchedule.create({ workspaceId: ws._id, createdBy: admin?._id, nextRunAt, ...doc });
    sCreated += 1;
  }
}

console.log(`Targets: ${tCreated} created, ${tUpdated} updated.`);
console.log(`Schedules: ${sCreated} created, ${sUpdated} updated.`);
await mongoose.disconnect();
