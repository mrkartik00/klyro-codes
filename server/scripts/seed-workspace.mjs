// Seed the main workspace with everything needed to run and test Klyro from the
// admin panel. Idempotent: creates only what's missing and never overwrites
// something you've edited in the UI.
//
//   cd server && node --env-file=.env scripts/seed-workspace.mjs
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const { Workspace } = await import('../src/models/Workspace.js');
const { Setting } = await import('../src/models/Setting.js');
const { Mailbox } = await import('../src/models/Mailbox.js');
const { Template } = await import('../src/models/Template.js');
const { Campaign, SequenceStep } = await import('../src/models/Campaign.js');
const { ScrapeTarget } = await import('../src/models/ScrapeTarget.js');
const { Organization } = await import('../src/models/Organization.js');
const { Contact } = await import('../src/models/Contact.js');
const { Lead } = await import('../src/models/Lead.js');
const { User } = await import('../src/models/User.js');

const ws = await Workspace.findOne().sort({ createdAt: 1 });
if (!ws) throw new Error('No workspace yet — register the first admin first.');
const W = ws._id;
const owner = await User.findOne({ email: 'kartik@klyro.codes' });
const by = owner?._id;
const log = (...a) => console.log('•', ...a);

// ---------- Settings (shown in admin → Settings, printed on PDFs) ----------
async function settingOnce(key, value) {
  const existing = await Setting.findOne({ workspaceId: W, key });
  if (existing) return log(`setting ${key}: kept (already set)`);
  await Setting.create({ workspaceId: W, key, value, encrypted: false, createdBy: by });
  log(`setting ${key}: created`);
}
await settingOnce('businessProfile', {
  name: 'Klyro',
  email: 'admin@klyro.codes',
  phone: '',
  address: '',
  website: 'https://klyro.codes',
  taxId: '',
});
await settingOnce('bankDetails', 'Add your bank / UPI / PayPal details in admin → Settings → Payment details.');

// ---------- Mailbox (Gmail connected in n8n) ----------
const mb = await Mailbox.findOneAndUpdate(
  { workspaceId: W, address: 'admin@klyro.codes' },
  {
    $setOnInsert: {
      workspaceId: W,
      createdBy: by,
      address: 'admin@klyro.codes',
      displayName: 'Kartik from Klyro',
      provider: 'google',
      status: 'active',
      dailyCap: 5,
      warmupStartedAt: new Date(),
    },
  },
  { upsert: true, new: true },
);
log(`mailbox ${mb.address}: ${mb.status}, ${mb.dailyCap}/day`);

// ---------- Lead sources: give last night's test searches real names ----------
for (const [from, to] of [
  ['E2E test — Round Rock dentists', 'Dentists — Round Rock, TX'],
  ['E2E test — Georgetown TX plumbers', 'Plumbers — Georgetown, TX'],
]) {
  const r = await ScrapeTarget.updateOne({ workspaceId: W, name: from }, { $set: { name: to } });
  if (r.modifiedCount) log(`lead source renamed: ${to}`);
}

// ---------- Email templates (the AI personalises these per lead) ----------
const TEMPLATES = [
  {
    name: 'Step 1 — Website intro',
    subject: 'Quick idea for {{company}}',
    body:
      'Hi {{firstName}},\n\nI was looking at {{company}} and noticed a couple of things on the website that are probably costing you enquiries — {{auditHighlight}}.\n\nWe build fast, mobile-first sites for local businesses. I put together a short page showing what yours could look like: {{pitchUrl}}\n\nWorth a 10-minute chat this week?\n\nKartik\nKlyro — klyro.codes',
  },
  {
    name: 'Step 2 — Follow-up',
    subject: 'Re: Quick idea for {{company}}',
    body:
      'Hi {{firstName}},\n\nJust bumping this in case it got buried. Most of our clients see more calls within the first month of launching the new site.\n\nHappy to send over a free audit of {{company}}\'s current site — want me to?\n\nKartik',
  },
  {
    name: 'Step 3 — Last check-in',
    subject: 'Should I close the file on {{company}}?',
    body:
      'Hi {{firstName}},\n\nI haven\'t heard back, so I\'ll assume now isn\'t the right time. If you ever want a faster, better-looking site for {{company}}, just reply to this email.\n\nAll the best,\nKartik',
  },
];
const tplIds = [];
for (const t of TEMPLATES) {
  let doc = await Template.findOne({ workspaceId: W, name: t.name });
  if (!doc) {
    doc = await Template.create({
      workspaceId: W,
      createdBy: by,
      name: t.name,
      channel: 'email',
      variants: [{ label: 'A', subject: t.subject, body: t.body, weight: 1 }],
      variables: ['firstName', 'company', 'auditHighlight', 'pitchUrl'],
    });
    log(`template created: ${t.name}`);
  }
  tplIds.push(doc._id);
}

// ---------- A ready-to-use campaign (draft until you press Activate) ----------
let campaign = await Campaign.findOne({ workspaceId: W, name: 'Local businesses — pilot' });
if (!campaign) {
  campaign = await Campaign.create({
    workspaceId: W,
    createdBy: by,
    name: 'Local businesses — pilot',
    channel: 'email',
    status: 'draft',
    sendWindow: { startHour: 9, endHour: 17, businessDaysOnly: true },
  });
  log('campaign created: Local businesses — pilot (draft)');
}
const delays = [0, 3, 5];
for (let i = 0; i < tplIds.length; i += 1) {
  const exists = await SequenceStep.findOne({ workspaceId: W, campaignId: campaign._id, order: i + 1 });
  if (!exists) {
    await SequenceStep.create({
      workspaceId: W,
      createdBy: by,
      campaignId: campaign._id,
      order: i + 1,
      delayDays: delays[i],
      templateId: tplIds[i],
      channel: 'email',
      stopOnReply: true,
    });
    log(`campaign step ${i + 1} added (${delays[i]} days)`);
  }
}

// ---------- A test lead that emails YOU, to try the full loop safely ----------
const testEmail = 'kartikgoutam911@gmail.com';
let org = await Organization.findOne({ workspaceId: W, name: 'Klyro Test Lead (Kartik)' });
if (!org) {
  org = await Organization.create({
    workspaceId: W,
    createdBy: by,
    name: 'Klyro Test Lead (Kartik)',
    domain: 'example.com',
    category: 'test',
    city: 'Delhi',
    country: 'IN',
  });
}
const contact = await Contact.findOneAndUpdate(
  { workspaceId: W, email: testEmail },
  { $setOnInsert: { workspaceId: W, createdBy: by, organizationId: org._id, email: testEmail, name: 'Kartik', emailStatus: 'valid' } },
  { upsert: true, new: true },
);
const lead = await Lead.findOne({ workspaceId: W, organizationId: org._id });
if (!lead) {
  await Lead.create({
    workspaceId: W,
    createdBy: by,
    organizationId: org._id,
    primaryContactId: contact._id,
    source: 'manual',
    stage: 'new',
    tags: ['test'],
    // Your timezone, so test sends happen during your day.
    timezone: 'Asia/Kolkata',
    notes: 'Test lead: enroll it in a campaign to receive the emails yourself, then reply to test reply tracking.',
  });
  log(`test lead created → ${testEmail} (tag: test)`);
} else {
  log('test lead: kept');
}

console.log('\nDone. Open admin.klyro.codes → Campaigns → "Local businesses — pilot".');
await mongoose.disconnect();
