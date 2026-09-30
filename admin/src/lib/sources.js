// Lead sources (saved searches) and lead platforms, shared across pages.
export const SOURCES = [
  { id: 'maps', label: 'Google Maps', short: 'Maps', tone: 'primary', hint: 'Local businesses by type & city' },
  { id: 'reddit', label: 'Reddit', short: 'Reddit', tone: 'warning', hint: 'People hiring someone to build a website or app' },
  { id: 'freelancer', label: 'Freelancer.com', short: 'Freelancer', tone: 'success', hint: 'Posted web/app projects with budgets — you bid' },
  { id: 'hackernews', label: 'Hacker News', short: 'HN', tone: 'warning', hint: '"Seeking freelancer" posts and Ask HN' },
  { id: 'tenders', label: 'Public tenders', short: 'Tenders', tone: 'success', hint: 'UK (and US) government website/software tenders' },
  { id: 'bluesky', label: 'Bluesky', short: 'Bluesky', tone: 'primary', hint: 'Posts asking for a developer (needs app password)' },
  { id: 'brave', label: 'LinkedIn & X (web search)', short: 'LinkedIn/X', tone: 'primary', hint: 'Public LinkedIn/X posts via Brave Search (needs key)' },
  { id: 'x', label: 'X (official API)', short: 'X', tone: 'default', hint: 'Recent X posts — paid per read, capped (needs token)' },
  { id: 'companieshouse', label: 'New UK companies', short: 'Companies', tone: 'success', hint: 'Just-incorporated UK businesses (needs key)' },
];
export const SOURCE = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
export const srcOf = (t) => t?.source || 'maps';
export const sourceLabel = (id) => SOURCE[id]?.label || id;
export const isPostSource = (id) => !['maps', 'companieshouse'].includes(id);

// Where a lead came from (Lead.source).
export const PLATFORM_LABEL = {
  maps: 'Google Maps',
  reddit: 'Reddit',
  freelancer: 'Freelancer.com',
  hackernews: 'Hacker News',
  tenders: 'Public tender',
  bluesky: 'Bluesky',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  companieshouse: 'Companies House',
  web: 'Web (clipped)',
  inbound: 'Website form',
  csv: 'CSV',
  import: 'CSV',
  manual: 'Manual',
};
