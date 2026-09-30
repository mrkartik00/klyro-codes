// Preset Google Maps searches for businesses likely to buy a website, booking
// system or app. Idempotent (matched by name) — re-run any time:
//   cd server && node --env-file=.env scripts/seed-maps-presets.mjs
// Each preset stays small (≈4–6 queries, ~5 min per run on the VPS scraper).
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const { Workspace } = await import('../src/models/Workspace.js');
const { User } = await import('../src/models/User.js');
const { ScrapeTarget } = await import('../src/models/ScrapeTarget.js');

const ws = await Workspace.findOne().sort({ createdAt: 1 });
if (!ws) throw new Error('No workspace yet — register the first admin first.');
const admin = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });

// Regions: growing metros with many independent businesses.
const R = {
  'Austin area': ['Austin, TX', 'Round Rock, TX', 'Cedar Park, TX', 'San Marcos, TX'],
  'Dallas–Fort Worth': ['Plano, TX', 'Frisco, TX', 'McKinney, TX', 'Fort Worth, TX'],
  Houston: ['Houston, TX', 'Katy, TX', 'Sugar Land, TX', 'The Woodlands, TX'],
  'San Antonio': ['San Antonio, TX', 'New Braunfels, TX', 'Boerne, TX'],
  Phoenix: ['Scottsdale, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Gilbert, AZ'],
  Florida: ['Tampa, FL', 'Orlando, FL', 'Sarasota, FL', 'Fort Myers, FL'],
  'South Florida': ['Fort Lauderdale, FL', 'Boca Raton, FL', 'West Palm Beach, FL'],
  Carolinas: ['Charlotte, NC', 'Raleigh, NC', 'Greenville, SC', 'Charleston, SC'],
  Atlanta: ['Atlanta, GA', 'Alpharetta, GA', 'Marietta, GA'],
  Nashville: ['Nashville, TN', 'Franklin, TN', 'Murfreesboro, TN'],
  Denver: ['Denver, CO', 'Aurora, CO', 'Colorado Springs, CO'],
  'Salt Lake': ['Salt Lake City, UT', 'Provo, UT', 'Ogden, UT'],
  'Las Vegas': ['Las Vegas, NV', 'Henderson, NV'],
  London: ['London'],
  'UK cities': ['Manchester', 'Birmingham', 'Leeds', 'Bristol'],
};

const P = (name, categories, region, extra = {}) => ({
  name: `${name} — ${region}`,
  categories,
  cities: R[region],
  country: ['London', 'UK cities'].includes(region) ? 'GB' : 'US',
  ...extra,
});
const NO_SITE = { filters: { excludeChains: true, hasWebsite: false } };

const PRESETS = [
  // Home services — high ticket, many with weak or no websites.
  { group: 'Home services', ...P('Roofers', ['roofing contractor'], 'Dallas–Fort Worth') },
  { group: 'Home services', ...P('Roofers', ['roofing contractor'], 'Florida') },
  { group: 'Home services', ...P('HVAC', ['hvac contractor'], 'Houston') },
  { group: 'Home services', ...P('HVAC', ['hvac contractor'], 'Phoenix') },
  { group: 'Home services', ...P('Plumbers', ['plumber'], 'Austin area') },
  { group: 'Home services', ...P('Plumbers', ['plumber'], 'Carolinas') },
  { group: 'Home services', ...P('Electricians', ['electrician'], 'Atlanta') },
  { group: 'Home services', ...P('Landscaping', ['landscaper'], 'Nashville') },
  { group: 'Home services', ...P('Pest control', ['pest control service'], 'San Antonio') },
  { group: 'Home services', ...P('Pool service', ['pool cleaning service'], 'Phoenix') },
  { group: 'Home services', ...P('Remodeling', ['kitchen remodeler', 'bathroom remodeler'], 'Denver') },
  { group: 'Home services', ...P('Cleaning', ['house cleaning service'], 'Carolinas') },
  { group: 'Home services', ...P('Movers', ['moving company'], 'Florida') },
  { group: 'Home services', ...P('Solar', ['solar energy company'], 'Las Vegas') },
  { group: 'Home services', ...P('Painters', ['painting contractor'], 'Salt Lake') },
  { group: 'Home services', ...P('Home services (no website)', ['handyman', 'fence contractor'], 'Houston', NO_SITE) },

  // Health & wellness — need booking, patient portals, apps.
  { group: 'Health & wellness', ...P('Dentists', ['dentist'], 'Phoenix') },
  { group: 'Health & wellness', ...P('Dentists', ['dentist'], 'Florida') },
  { group: 'Health & wellness', ...P('Orthodontists', ['orthodontist'], 'Dallas–Fort Worth') },
  { group: 'Health & wellness', ...P('Chiropractors', ['chiropractor'], 'Atlanta') },
  { group: 'Health & wellness', ...P('Physical therapy', ['physical therapist'], 'Carolinas') },
  { group: 'Health & wellness', ...P('Med spas', ['med spa'], 'South Florida') },
  { group: 'Health & wellness', ...P('Med spas', ['med spa'], 'Austin area') },
  { group: 'Health & wellness', ...P('Veterinarians', ['veterinarian'], 'Denver') },
  { group: 'Health & wellness', ...P('Therapists', ['counselor', 'psychologist'], 'Nashville') },

  // Fitness & beauty — memberships, class booking, apps.
  { group: 'Fitness & beauty', ...P('Gyms & studios', ['gym', 'yoga studio'], 'Austin area') },
  { group: 'Fitness & beauty', ...P('Gyms & studios', ['pilates studio', 'crossfit gym'], 'Salt Lake') },
  { group: 'Fitness & beauty', ...P('Martial arts', ['martial arts school'], 'Houston') },
  { group: 'Fitness & beauty', ...P('Salons', ['hair salon'], 'Atlanta') },
  { group: 'Fitness & beauty', ...P('Barbers (no website)', ['barber shop'], 'Dallas–Fort Worth', NO_SITE) },
  { group: 'Fitness & beauty', ...P('Nail & lash', ['nail salon', 'eyelash extension service'], 'Florida', NO_SITE) },

  // Professional services — trust sites, client portals.
  { group: 'Professional services', ...P('Law firms', ['personal injury attorney'], 'Houston') },
  { group: 'Professional services', ...P('Law firms', ['family law attorney', 'estate planning attorney'], 'Carolinas') },
  { group: 'Professional services', ...P('Accountants', ['accountant', 'bookkeeping service'], 'Nashville') },
  { group: 'Professional services', ...P('Insurance agents', ['insurance agency'], 'San Antonio') },
  { group: 'Professional services', ...P('Real estate', ['real estate agency'], 'Phoenix') },
  { group: 'Professional services', ...P('Mortgage brokers', ['mortgage broker'], 'Dallas–Fort Worth') },

  // Food, hospitality, retail — online ordering, e-commerce, apps.
  { group: 'Food & retail', ...P('Restaurants (no website)', ['restaurant'], 'San Antonio', NO_SITE) },
  { group: 'Food & retail', ...P('Cafés & bakeries', ['coffee shop', 'bakery'], 'Denver') },
  { group: 'Food & retail', ...P('Food trucks & caterers', ['caterer', 'food truck'], 'Austin area') },
  { group: 'Food & retail', ...P('Boutiques', ['clothing boutique'], 'Nashville') },
  { group: 'Food & retail', ...P('Florists', ['florist'], 'Atlanta') },
  { group: 'Food & retail', ...P('Event venues', ['wedding venue', 'event venue'], 'Carolinas') },
  { group: 'Food & retail', ...P('Photographers', ['wedding photographer'], 'Florida') },

  // Auto & education.
  { group: 'Auto & education', ...P('Auto repair', ['auto repair shop'], 'Phoenix', NO_SITE) },
  { group: 'Auto & education', ...P('Auto detailing', ['car detailing service'], 'Las Vegas') },
  { group: 'Auto & education', ...P('Driving & tutoring', ['tutoring service', 'driving school'], 'Houston') },
  { group: 'Auto & education', ...P('Childcare', ['child care agency', 'preschool'], 'Dallas–Fort Worth') },

  // UK.
  { group: 'United Kingdom', ...P('Dentists', ['dentist'], 'UK cities') },
  { group: 'United Kingdom', ...P('Trades', ['plumber', 'electrician'], 'UK cities') },
  { group: 'United Kingdom', ...P('Builders', ['builder'], 'London') },
  { group: 'United Kingdom', ...P('Beauty salons', ['beauty salon'], 'London') },
  { group: 'United Kingdom', ...P('Restaurants (no website)', ['restaurant'], 'UK cities', NO_SITE) },
  { group: 'United Kingdom', ...P('Solicitors', ['solicitor'], 'UK cities') },
];

let created = 0;
let updated = 0;
for (const p of PRESETS) {
  const doc = {
    workspaceId: ws._id,
    source: 'maps',
    maxResults: 60,
    schedule: 'once',
    active: true,
    filters: { excludeChains: true },
    ...p,
  };
  const r = await ScrapeTarget.updateOne(
    { workspaceId: ws._id, name: p.name, deletedAt: null },
    { $set: doc, $setOnInsert: { createdBy: admin?._id } },
    { upsert: true },
  );
  if (r.upsertedCount) created += 1;
  else if (r.modifiedCount) updated += 1;
}
console.log(`maps presets: ${PRESETS.length} total · ${created} new · ${updated} updated`);
await mongoose.disconnect();
