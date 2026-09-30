// Preset Reddit searches for BUYERS (people who want to hire someone to build a
// website, web app or Android/iOS app). Idempotent by name:
//   cd server && node --env-file=.env scripts/seed-reddit-presets.mjs
// Hiring boards are read in full ([Hiring] posts only); other subreddits are
// searched with the buyer phrases. Scheduled scans rotate through these.
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const { Workspace } = await import('../src/models/Workspace.js');
const { User } = await import('../src/models/User.js');
const { ScrapeTarget } = await import('../src/models/ScrapeTarget.js');

const ws = await Workspace.findOne().sort({ createdAt: 1 });
if (!ws) throw new Error('No workspace yet — register the first admin first.');
const admin = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });

const WEBSITE = ['need a website built', 'looking for a web designer', 'looking for a web developer', 'recommend a web developer', 'website for my business', 'redesign my website'];
const APP = ['need an app built', 'looking for an app developer', 'hire an app developer', 'who can build my app', 'cost to build an app', 'app development company'];
const MVP = ['build my MVP', 'looking for a developer to build', 'hire a developer', 'looking for a dev agency', 'looking for a technical cofounder', 'outsource development'];

const PRESETS = [
  // Hiring boards — read newest posts, keep [Hiring] posts for devs/websites/apps.
  { group: 'Hiring boards', name: 'Reddit — [Hiring] developer boards', communities: ['forhire', 'freelance_forhire', 'hireaprogrammer'], keywords: ['(hiring posts)'] },
  { group: 'Hiring boards', name: 'Reddit — [Hiring] B2B & small tasks', communities: ['b2bforhire', 'slavelabour', 'DoneDirtCheap'], keywords: ['(hiring posts)'] },

  // Founders.
  { group: 'Founders & startups', name: 'Reddit — founders needing an MVP', communities: ['startups', 'SaaS', 'EntrepreneurRideAlong'], keywords: MVP },
  { group: 'Founders & startups', name: 'Reddit — app ideas looking for a developer', communities: ['AppIdeas', 'startup_ideas', 'sidehustle'], keywords: APP },
  { group: 'Founders & startups', name: 'Reddit — technical cofounder / dev partner', communities: ['cofounder', 'Entrepreneur', 'startups'], keywords: ['looking for a technical cofounder', 'need a developer partner', 'looking for a CTO', 'build my app'] },

  // Small businesses.
  { group: 'Small businesses', name: 'Reddit — small businesses needing a website', communities: ['smallbusiness', 'Entrepreneur', 'sweatystartup'], keywords: WEBSITE },
  { group: 'Small businesses', name: 'Reddit — small businesses wanting an app', communities: ['smallbusiness', 'Entrepreneur', 'sweatystartup'], keywords: [...APP, 'booking app for my business', 'customer portal'] },
  { group: 'Small businesses', name: 'Reddit — UK small businesses', communities: ['UKBusiness', 'smallbusinessuk', 'ukbusinessadvice'], keywords: [...WEBSITE, 'need an app built'] },

  // E-commerce.
  { group: 'E-commerce', name: 'Reddit — store owners hiring Shopify/WooCommerce devs', communities: ['shopify', 'ecommerce', 'woocommerce'], keywords: ['hire a shopify developer', 'need a shopify expert', 'looking for a developer for my store', 'build an online store', 'custom shopify app', 'migrate my store'] },
  { group: 'E-commerce', name: 'Reddit — Etsy/Amazon sellers wanting their own site', communities: ['EtsySellers', 'AmazonSeller', 'FulfillmentByAmazon'], keywords: ['own website', 'need a website built', 'looking for a web developer', 'build an online store'] },

  // Industries.
  { group: 'Industries', name: 'Reddit — restaurants & food businesses', communities: ['restaurateur', 'restaurantowners', 'foodtrucks'], keywords: ['website for my restaurant', 'online ordering', 'app for my restaurant', 'need a website built', 'looking for a web developer'] },
  { group: 'Industries', name: 'Reddit — real estate agents & brokers', communities: ['realtors', 'RealEstateTechnology', 'CommercialRealEstate'], keywords: ['real estate website', 'IDX website', 'need a website built', 'looking for a developer', 'app for my brokerage'] },
  { group: 'Industries', name: 'Reddit — trainers, coaches & studios', communities: ['personaltraining', 'lifecoaching', 'yogateachers'], keywords: ['app for my clients', 'coaching app', 'website for my business', 'booking website', 'looking for a developer'] },
  { group: 'Industries', name: 'Reddit — clinics & practices', communities: ['dentistry', 'Chiropractic', 'physicaltherapy'], keywords: ['website for my practice', 'patient booking', 'practice website', 'looking for a web developer', 'need an app built'] },
  { group: 'Industries', name: 'Reddit — trades & home services', communities: ['Construction', 'HVAC', 'Plumbing'], keywords: ['website for my business', 'need a website built', 'looking for a web designer', 'app for my business', 'scheduling app'] },
  { group: 'Industries', name: 'Reddit — nonprofits & churches', communities: ['nonprofit', 'Church'], keywords: ['need a website built', 'looking for a web developer', 'donation website', 'app for our church'] },
];

let created = 0;
let updated = 0;
for (const p of PRESETS) {
  const doc = {
    workspaceId: ws._id,
    source: 'reddit',
    maxResults: 25,
    active: true,
    filters: { minIntent: 0.6, maxAgeDays: 14 },
    ...p,
    keywords: p.keywords.filter((k) => !k.startsWith('(')),
  };
  const r = await ScrapeTarget.updateOne(
    { workspaceId: ws._id, name: p.name, deletedAt: null },
    { $set: doc, $setOnInsert: { createdBy: admin?._id } },
    { upsert: true },
  );
  if (r.upsertedCount) created += 1;
  else if (r.modifiedCount) updated += 1;
}
// Group the searches created before presets existed.
await ScrapeTarget.updateMany({ workspaceId: ws._id, source: 'reddit', group: { $in: [null, ''] } }, { $set: { group: 'General' } });
await ScrapeTarget.updateMany({ workspaceId: ws._id, source: { $ne: 'reddit' }, group: { $in: [null, ''] } }, { $set: { group: 'My searches', source: 'maps' } });
console.log(`reddit presets: ${PRESETS.length} total · ${created} new · ${updated} updated`);
await mongoose.disconnect();
