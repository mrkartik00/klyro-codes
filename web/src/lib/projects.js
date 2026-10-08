// The 7 real Klyro projects — source of truth for the marketing site.
// `hue` drives each project's preview colour; `featured` gets a wide card.
export const projects = [
  {
    name: 'ESTATE100',
    preview: 'estate100',
    // Site sends X-Frame-Options: SAMEORIGIN → show captured pages instead.
    // Set to true once it allows https://klyro.codes in frame-ancestors.
    embed: false,
    url: 'https://estate100.com',
    domain: 'estate100.com',
    category: 'Real estate platform',
    tags: ['Maps', 'AI scoring', '3D plans'],
    blurb: 'Verified land investment platform with interactive maps, AI land-value scoring and 3D master plans.',
    hue: '#4da3ff',
    featured: true,
  },
  {
    name: 'Janki Care',
    preview: 'janki-care',
    embed: true,
    url: 'https://janki.care',
    domain: 'janki.care',
    category: 'Healthcare · Web + mobile',
    tags: ['Telemedicine', 'React Native', 'Realtime'],
    blurb: 'Telemedicine platform with video consults, digital prescriptions, reminders and a secure medical vault.',
    hue: '#34d399',
  },
  {
    name: 'VillageStay',
    preview: 'villagestay',
    embed: true,
    url: 'https://villagestay.live',
    domain: 'villagestay.live',
    category: 'Travel marketplace',
    tags: ['PWA', 'Booking', 'Marketplace'],
    blurb: 'Installable PWA connecting travellers with authentic rural homestays and local experiences.',
    hue: '#f59e0b',
  },
  {
    name: 'AYUSH Startup Portal',
    preview: 'ayush-startup-portal',
    embed: true, // no framing restriction
    url: 'https://ayushstartup.aiia.gov.in',
    domain: 'ayushstartup.aiia.gov.in',
    category: 'GovTech · Hackathon winner',
    tags: ['Next.js', 'PostgreSQL', 'AWS'],
    blurb: 'Smart India Hackathon–winning registration, workflow and document portal for AYUSH startups.',
    hue: '#a78bfa',
    featured: true,
  },
  {
    name: 'Shyam Yatra',
    preview: 'shyam-yatra',
    embed: false, // X-Frame-Options: SAMEORIGIN (see estate100)
    url: 'https://shyamyatra.in',
    domain: 'shyamyatra.in',
    category: 'Pilgrimage & booking',
    tags: ['Booking flows', 'Content', 'SEO'],
    blurb: 'Pilgrimage planner with darshan timings, festival info and booking for buses, hotels and cabs.',
    hue: '#fb7185',
  },
  {
    name: 'SnackTrack',
    preview: null, // site offline (DNS not resolving)
    embed: false,
    url: 'https://snacktrack.me',
    domain: 'snacktrack.me',
    category: 'Inventory SaaS',
    tags: ['Dashboard', 'Realtime', 'CI/CD'],
    blurb: 'Food inventory system with an analytics dashboard, real-time updates and automated deploys.',
    hue: '#22d3ee',
  },
  {
    name: 'Toshvik',
    preview: null, // site offline (DNS not resolving)
    embed: false,
    url: 'https://toshvik.in',
    domain: 'toshvik.in',
    category: 'D2C brand site',
    tags: ['React', 'Product catalogue'],
    blurb: 'Product and recipe showcase for a food brand, with theme switching and detail pages.',
    hue: '#facc15',
  },
];

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default projects;
