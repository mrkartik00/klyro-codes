// Lead finder beyond Reddit: marketplaces, forums, tenders, social networks.
//
// Every source turns its items into the same "post" shape, then shares one
// pipeline with Reddit: keyword pre-filter → AI buyer check (cached, paced) →
// lead + draft reply in Approvals. Nothing is ever posted automatically.
//
//   freelancer     Freelancer.com public projects API           free, no key
//   hackernews     HN "SEEKING FREELANCER" + Ask HN (Algolia)   free, no key
//   tenders        UK Find a Tender + Contracts Finder (+ SAM)  free (SAM key optional)
//   bluesky        Bluesky post search                          free app password
//   brave          Public LinkedIn / X posts via Brave Search   free $5 credit/month
//   x              Official X API recent search                 pay-per-use, hard monthly cap
//   companieshouse Newly incorporated UK companies               free key (business leads)
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Lead } from '../models/Lead.js';
import { Setting } from '../models/Setting.js';
import { ScrapeTarget, ScrapeJob } from '../models/ScrapeTarget.js';
import { SocialSeen } from '../models/SocialSeen.js';
import { emitToWorkspace } from '../socket/index.js';
import { ingestBatch } from './lead.service.js';
import { BUILD_RE, HIRE_RE, SELLER_RE, decodeEntities, qualify, saveIntentLead } from './social.service.js';

const UA = 'klyro-lead-finder/1.0 (+https://klyro.codes; admin@klyro.codes)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const strip = (html) =>
  decodeEntities(decodeEntities(String(html ?? '')))
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const INTENT_SOURCES = {
  freelancer: { label: 'Freelancer.com', trusted: true, replyStyle: 'bid', needs: [], hint: 'Posted projects with budgets. Reply = a bid you place on Freelancer.' },
  hackernews: { label: 'Hacker News', trusted: false, replyStyle: 'dm', needs: [], hint: '"SEEKING FREELANCER" posts in the monthly thread, plus Ask HN.' },
  tenders: { label: 'Public tenders', trusted: true, replyStyle: 'tender', needs: [], hint: 'UK Find a Tender + Contracts Finder (and US SAM.gov with a key).' },
  bluesky: { label: 'Bluesky', trusted: false, replyStyle: 'reply', needs: ['BSKY_HANDLE', 'BSKY_APP_PASSWORD'], hint: 'Post search. Needs a free app password.' },
  brave: { label: 'LinkedIn & X (via web search)', trusted: false, replyStyle: 'dm', needs: ['BRAVE_API_KEY'], hint: 'Public LinkedIn / X posts found by Brave Search (1–3 days delay).' },
  x: { label: 'X (official API)', trusted: false, replyStyle: 'reply', needs: ['X_BEARER_TOKEN'], hint: 'Recent X posts. Paid per post read, hard monthly cap.' },
  companieshouse: { label: 'New UK companies', trusted: true, business: true, needs: ['COMPANIES_HOUSE_API_KEY'], hint: 'Companies incorporated in the last days — they all need a website.' },
};

export const isIntentSource = (s) => Boolean(INTENT_SOURCES[s]);
export const missingKeys = (s) => (INTENT_SOURCES[s]?.needs || []).filter((k) => !env[k]);
export function sourceStatus() {
  return Object.entries(INTENT_SOURCES).map(([id, c]) => ({ id, label: c.label, hint: c.hint, ready: missingKeys(id).length === 0, missing: missingKeys(id) }));
}

async function getJson(url, opts = {}, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, { ...opts, headers: { 'user-agent': UA, accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(25000) }).catch((e) => ({ ok: false, status: e.name }));
    if (res.ok) return res.json();
    if (attempt >= retries || ![429, 500, 502, 503, 'TimeoutError'].includes(res.status)) {
      const body = res.text ? (await res.text().catch(() => '')).slice(0, 160) : '';
      throw new Error(`${new URL(url).host} ${res.status} ${body}`.trim());
    }
    await sleep(3000 * (attempt + 1));
  }
}

/** Monthly usage counter (paid APIs): usage('x', 25) adds; usage('x') reads. */
export async function usage(workspaceId, name, add = 0) {
  const key = `usage.${name}.${new Date().toISOString().slice(0, 7)}`;
  if (!add) return (await Setting.findOne({ workspaceId, key }).lean())?.value || 0;
  const r = await Setting.findOneAndUpdate({ workspaceId, key }, { $inc: { value: add } }, { upsert: true, new: true });
  return r.value;
}

/* ------------------------------ adapters ------------------------------ */

const FREELANCER_QUERIES = ['website', 'web app', 'mobile app', 'android app', 'ios app', 'shopify', 'wordpress', 'ecommerce', 'react', 'flutter'];

export async function fetchFreelancer({ keywords, sinceDays, filters = {} }) {
  const since = Date.now() / 1000 - sinceDays * 86400;
  const out = new Map();
  for (const q of keywords.length ? keywords : FREELANCER_QUERIES) {
    const qs = new URLSearchParams({ query: q, limit: '100', sort_field: 'time_submitted', full_description: 'true' });
    const data = await getJson(`https://www.freelancer.com/api/projects/0.1/projects/active?${qs}`).catch((e) => (logger.warn({ err: e }, 'freelancer fetch'), null));
    for (const p of data?.result?.projects || []) {
      if (p.time_submitted < since || out.has(p.id)) continue;
      const rate = p.currency?.exchange_rate || 1;
      const hourly = p.type === 'hourly';
      const min = p.budget?.minimum ?? 0;
      const max = p.budget?.maximum ?? min;
      const usd = Math.round((hourly ? max * 40 : max) * rate); // hourly ≈ one week
      const bids = p.bid_stats?.bid_count ?? 0;
      if (usd < (filters.minBudgetUsd ?? 150)) continue;
      if (bids > (filters.maxBids ?? 80)) continue;
      out.set(p.id, {
        id: `fl_${p.id}`,
        platform: 'freelancer',
        title: decodeEntities(p.title),
        text: strip(p.description).slice(0, 4000),
        author: 'Freelancer.com client',
        handle: 'Freelancer.com client',
        authorUrl: null,
        url: `https://www.freelancer.com/projects/${p.seo_url}`,
        postedAt: new Date(p.time_submitted * 1000).toISOString(),
        budget: `${p.currency?.sign ?? ''}${min}–${max} ${p.currency?.code ?? ''}${hourly ? '/hr' : ''} (≈$${usd})`,
        community: 'freelancer',
        communityLabel: `Freelancer.com · ${bids} bids`,
        trusted: true,
      });
    }
    await sleep(1200);
  }
  return [...out.values()];
}

export async function fetchHackerNews({ keywords, sinceDays }) {
  // The monthly "Freelancer? Seeking freelancer?" thread stays useful all month.
  const since = Math.floor(Date.now() / 1000 - Math.max(sinceDays, 30) * 86400);
  const searches = [
    { query: '"SEEKING FREELANCER"', tags: 'comment', trusted: true, label: 'HN · Seeking freelancer' },
    ...(keywords.length ? keywords : ['looking for a developer', 'hire a developer', 'need an app built', 'looking for an agency']).map((k) => ({
      query: `"${k}"`,
      tags: '(story,comment)',
      trusted: false,
      label: 'Hacker News',
    })),
  ];
  const out = new Map();
  for (const s of searches) {
    const qs = new URLSearchParams({ query: s.query, tags: s.tags, numericFilters: `created_at_i>${since}`, hitsPerPage: '100' });
    const data = await getJson(`https://hn.algolia.com/api/v1/search_by_date?${qs}`).catch(() => null);
    for (const h of data?.hits || []) {
      if (out.has(h.objectID)) continue;
      const text = strip(h.comment_text || h.story_text || '');
      const title = h.title || text.split('\n')[0].slice(0, 140);
      out.set(h.objectID, {
        id: `hn_${h.objectID}`,
        platform: 'hackernews',
        title,
        text: text.slice(0, 4000),
        author: h.author,
        handle: `${h.author} (HN)`,
        authorUrl: `https://news.ycombinator.com/user?id=${h.author}`,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        postedAt: h.created_at,
        community: 'hackernews',
        communityLabel: s.label,
        trusted: s.trusted,
      });
    }
    await sleep(800);
  }
  return [...out.values()];
}

// Web/software CPV codes (EU procurement vocabulary).
const WEB_CPV = /^(72|48|79342|79415)/; // IT services, software, digital marketing/design consultancy
const cpvOf = (t = {}) => [t.classification?.id, ...(t.items || []).flatMap((i) => [i.classification?.id, ...(i.additionalClassifications || []).map((c) => c.id)])].filter(Boolean);

async function ocdsPages(url, pages = 5) {
  const out = [];
  let next = url;
  for (let i = 0; next && i < pages; i += 1) {
    const d = await getJson(next).catch((e) => (logger.warn({ err: e }, 'tender fetch'), null));
    out.push(...(d?.releases || []));
    next = d?.links?.next || null;
    await sleep(1000);
  }
  return out;
}

export async function fetchTenders({ sinceDays }) {
  const from = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString().slice(0, 19);
  const [fts, cf] = await Promise.all([
    ocdsPages(`https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=${from}&limit=100&stages=tender`),
    ocdsPages(`https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=${from}&stages=tender&limit=100`),
  ]);
  const out = new Map();
  const add = (r, portal) => {
    const t = r.tender || {};
    const text = `${t.title || ''}\n${t.description || ''}`;
    if (!(cpvOf(t).some((c) => WEB_CPV.test(c)) || BUILD_RE.test(text))) return;
    if (!BUILD_RE.test(text) && !/software|digital|portal|platform|application|system|data|online|web/i.test(text)) return;
    const id = `td_${r.ocid || r.id}`;
    if (out.has(id)) return;
    const value = t.value?.amount ? `${t.value.amount.toLocaleString('en-GB')} ${t.value.currency || 'GBP'}` : '';
    const deadline = t.tenderPeriod?.endDate ? `Deadline ${t.tenderPeriod.endDate.slice(0, 10)}` : '';
    const noticeUrl =
      portal === 'cf'
        ? `https://www.contractsfinder.service.gov.uk/Notice/${String(r.id).split('-').slice(0, 5).join('-')}`
        : `https://www.find-tender.service.gov.uk/Search/Results?keywords=${encodeURIComponent(t.title || '')}`;
    out.set(id, {
      id,
      platform: 'tenders',
      title: t.title || 'Tender',
      text: [strip(t.description).slice(0, 3500), deadline, value && `Value ${value}`].filter(Boolean).join('\n'),
      author: r.buyer?.name || 'Public buyer',
      handle: r.buyer?.name || 'Public buyer',
      authorUrl: null,
      url: noticeUrl,
      postedAt: r.date,
      budget: value,
      community: portal,
      communityLabel: portal === 'cf' ? 'UK Contracts Finder' : 'UK Find a Tender',
      trusted: true,
    });
  };
  fts.forEach((r) => add(r, 'fts'));
  cf.forEach((r) => add(r, 'cf'));

  if (env.SAM_API_KEY) {
    const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    for (const ncode of ['541511', '541512', '541519']) {
      const qs = new URLSearchParams({ api_key: env.SAM_API_KEY, postedFrom: fmt(new Date(Date.now() - sinceDays * 864e5)), postedTo: fmt(new Date()), ncode, limit: '100' });
      const d = await getJson(`https://api.sam.gov/opportunities/v2/search?${qs}`).catch(() => null);
      for (const o of d?.opportunitiesData || []) {
        if (!/web|website|app|portal|software|digital|platform/i.test(o.title)) continue;
        out.set(`sam_${o.noticeId}`, {
          id: `sam_${o.noticeId}`,
          platform: 'tenders',
          title: o.title,
          text: [o.fullParentPathName, o.type, o.responseDeadLine && `Deadline ${o.responseDeadLine}`].filter(Boolean).join('\n'),
          author: o.fullParentPathName?.split('.')[0] || 'US agency',
          handle: o.fullParentPathName?.split('.')[0] || 'US agency',
          authorUrl: null,
          url: o.uiLink,
          postedAt: o.postedDate,
          community: 'sam',
          communityLabel: 'US SAM.gov',
          trusted: true,
        });
      }
      await sleep(1000);
    }
  }
  return [...out.values()];
}

let bsky = { jwt: null, until: 0, pds: 'https://bsky.social' };
async function bskySession() {
  if (bsky.jwt && Date.now() < bsky.until) return bsky;
  const s = await getJson('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }),
  });
  const pds = s.didDoc?.service?.find((x) => x.id === '#atproto_pds')?.serviceEndpoint || 'https://bsky.social';
  bsky = { jwt: s.accessJwt, until: Date.now() + 90 * 60 * 1000, pds };
  return bsky;
}

export const DEFAULT_SOCIAL_PHRASES = ['looking for a developer', 'need a website built', 'need an app built', 'looking for an app developer', 'hire a web developer', 'looking for a web designer', 'recommend a developer', 'looking for a dev agency'];

export async function fetchBluesky({ keywords, sinceDays }) {
  const { jwt, pds } = await bskySession();
  // Bluesky's `since` parameter returns nothing, so filter by date here.
  const since = Date.now() - sinceDays * 864e5;
  const out = new Map();
  for (const k of keywords.length ? keywords : DEFAULT_SOCIAL_PHRASES) {
    const qs = new URLSearchParams({ q: `"${k}"`, sort: 'latest', limit: '100' });
    const d = await getJson(`${pds}/xrpc/app.bsky.feed.searchPosts?${qs}`, { headers: { authorization: `Bearer ${jwt}` } }).catch((e) => (logger.warn({ err: e }, 'bluesky search'), null));
    for (const p of d?.posts || []) {
      const rkey = p.uri.split('/').pop();
      const h = p.author?.handle;
      const text = String(p.record?.text || '');
      if (new Date(p.record?.createdAt || p.indexedAt).getTime() < since) continue;
      out.set(p.uri, {
        id: `bsky_${hash(p.uri)}`,
        platform: 'bluesky',
        title: text.split('\n')[0].slice(0, 140),
        text: text.slice(0, 4000),
        author: h,
        handle: `@${h}`,
        authorUrl: `https://bsky.app/profile/${h}`,
        url: `https://bsky.app/profile/${h}/post/${rkey}`,
        postedAt: p.record?.createdAt || p.indexedAt,
        community: 'bluesky',
        communityLabel: 'Bluesky',
      });
    }
    await sleep(1500);
  }
  return [...out.values()];
}

/** Who posted a LinkedIn / X URL, from the URL alone. */
export function authorFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'x.com' || host === 'twitter.com') return parts[0] && !['i', 'search', 'hashtag'].includes(parts[0]) ? { platform: 'x', name: parts[0], handle: `@${parts[0]}`, url: `https://x.com/${parts[0]}` } : { platform: 'x' };
    if (host.endsWith('linkedin.com')) {
      if (parts[0] === 'in' && parts[1]) return { platform: 'linkedin', name: parts[1], handle: parts[1], url: `https://www.linkedin.com/in/${parts[1]}` };
      if (parts[0] === 'posts' && parts[1]) {
        const slug = parts[1].split('_')[0];
        return { platform: 'linkedin', name: slug, handle: slug, url: `https://www.linkedin.com/in/${slug}` };
      }
      return { platform: 'linkedin' };
    }
    if (host === 'threads.net' || host === 'threads.com') return parts[0]?.startsWith('@') ? { platform: 'threads', name: parts[0].slice(1), handle: parts[0], url: `https://www.threads.net/${parts[0]}` } : { platform: 'threads' };
    if (host === 'instagram.com') return parts[0] && !['p', 'reel', 'explore'].includes(parts[0]) ? { platform: 'instagram', name: parts[0], handle: `@${parts[0]}`, url: `https://www.instagram.com/${parts[0]}` } : { platform: 'instagram' };
    if (host.endsWith('facebook.com')) return { platform: 'facebook' };
    if (host.endsWith('reddit.com')) {
      const i = parts.indexOf('user');
      return i >= 0 && parts[i + 1] ? { platform: 'reddit', name: parts[i + 1], handle: `u/${parts[i + 1]}`, url: `https://www.reddit.com/user/${parts[i + 1]}` } : { platform: 'reddit' };
    }
    if (host === 'bsky.app') return parts[1] ? { platform: 'bluesky', name: parts[1], handle: `@${parts[1]}`, url: `https://bsky.app/profile/${parts[1]}` } : { platform: 'bluesky' };
    if (host === 'news.ycombinator.com') return { platform: 'hackernews' };
    if (host === 'freelancer.com') return { platform: 'freelancer' };
    return { platform: 'web' };
  } catch {
    return { platform: 'web' };
  }
}

// BRAVE_API_KEY may hold several keys (comma-separated); each free key has
// ~$5 credit ≈ 1,000 searches/month, so they are used one after another.
export const BRAVE_PER_KEY_CAP = 950;
export const braveKeys = () => String(env.BRAVE_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean);
export async function braveUsage(workspaceId) {
  const keys = braveKeys();
  const used = await Promise.all(keys.map((_, i) => usage(workspaceId, `brave${i}`)));
  return { used: used.reduce((a, b) => a + b, 0), cap: keys.length * BRAVE_PER_KEY_CAP, perKey: used };
}
const exhausted = new Set(); // keys that returned 402/429 this process

async function braveSearch(workspaceId, qs) {
  const keys = braveKeys();
  for (let i = 0; i < keys.length; i += 1) {
    if (exhausted.has(keys[i]) || (await usage(workspaceId, `brave${i}`)) >= BRAVE_PER_KEY_CAP) continue;
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${qs}`, {
      headers: { 'x-subscription-token': keys[i], accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (!res) return null;
    await usage(workspaceId, `brave${i}`, 1);
    if (res.ok) return res.json();
    if ([401, 402, 403, 429].includes(res.status)) {
      exhausted.add(keys[i]); // out of credit / invalid / rate limited → next key
      logger.warn({ status: res.status, key: i }, 'brave key unavailable, trying next');
      continue;
    }
    return null;
  }
  throw new Error('All Brave keys are out of monthly credit');
}

export async function fetchBrave({ workspaceId, keywords, filters = {} }) {
  // sites: [] or ['*'] = the whole web (e.g. RFP pages); default LinkedIn + X.
  const sites = !filters.sites ? ['linkedin.com/posts', 'x.com'] : filters.sites.length && !filters.sites.includes('*') ? filters.sites : ['*'];
  const freshness = filters.freshness || 'pm';
  const maxQueries = filters.maxQueries ?? 12;
  const out = new Map();
  let n = 0;
  for (const k of keywords.length ? keywords : DEFAULT_SOCIAL_PHRASES) {
    for (const site of sites) {
      if (n >= maxQueries) return [...out.values()];
      const qs = new URLSearchParams({ q: site === '*' ? k : `site:${site} "${k}"`, freshness, count: '20' });
      let d;
      try {
        d = await braveSearch(workspaceId, qs);
      } catch (err) {
        if (!out.size) throw err;
        return [...out.values()];
      }
      n += 1;
      for (const r of d?.web?.results || []) {
        const a = authorFromUrl(r.url);
        out.set(r.url, {
          id: `web_${hash(r.url)}`,
          platform: a.platform,
          title: strip(r.title).slice(0, 200),
          text: strip([r.description, ...(r.extra_snippets || [])].join('\n')).slice(0, 4000),
          author: a.name || 'unknown',
          handle: a.handle || a.name || 'unknown',
          authorUrl: a.url || null,
          url: r.url,
          postedAt: r.page_age || new Date().toISOString(),
          community: a.platform,
          communityLabel: a.platform === 'web' ? `Web · ${new URL(r.url).hostname.replace(/^www\./, '')}` : `${PLATFORM_NAMES[a.platform] || a.platform} (web search)`,
          replyStyle: a.platform === 'web' ? 'tender' : undefined,
        });
      }
      await sleep(1100); // Brave free: 1 request/second
    }
  }
  return [...out.values()];
}

export async function fetchX({ workspaceId, target, keywords }) {
  const cap = env.X_MONTHLY_READ_CAP;
  const used = await usage(workspaceId, 'x');
  const budget = Math.min(100, cap - used);
  if (budget < 10) throw new Error(`X monthly read cap reached (${used}/${cap}) — raise X_MONTHLY_READ_CAP to read more`);
  const phrases = (keywords.length ? keywords : DEFAULT_SOCIAL_PHRASES).map((k) => `"${k.replace(/"/g, '')}"`);
  let query = '';
  for (const p of phrases) if (`(${[query, p].filter(Boolean).join(' OR ')}) -is:retweet -is:reply lang:en`.length <= 500) query = [query, p].filter(Boolean).join(' OR ');
  const qs = new URLSearchParams({
    query: `(${query}) -is:retweet -is:reply lang:en`,
    max_results: String(Math.max(10, budget)),
    'tweet.fields': 'created_at,author_id',
    expansions: 'author_id',
    'user.fields': 'username,name,description',
  });
  if (target.filters?.sinceId) qs.set('since_id', target.filters.sinceId);
  const d = await getJson(`https://api.x.com/2/tweets/search/recent?${qs}`, { headers: { authorization: `Bearer ${env.X_BEARER_TOKEN}` } }, { retries: 0 });
  const tweets = d.data || [];
  await usage(workspaceId, 'x', tweets.length);
  if (d.meta?.newest_id) await ScrapeTarget.updateOne({ _id: target._id }, { $set: { 'filters.sinceId': d.meta.newest_id } });
  const users = Object.fromEntries((d.includes?.users || []).map((u) => [u.id, u]));
  return tweets.map((t) => {
    const u = users[t.author_id] || {};
    return {
      id: `x_${t.id}`,
      platform: 'x',
      title: t.text.split('\n')[0].slice(0, 140),
      text: t.text,
      author: u.username || t.author_id,
      handle: u.username ? `@${u.username}` : t.author_id,
      authorUrl: u.username ? `https://x.com/${u.username}` : null,
      url: `https://x.com/${u.username || 'i'}/status/${t.id}`,
      postedAt: t.created_at,
      community: 'x',
      communityLabel: 'X',
    };
  });
}

// UK SIC codes for businesses that typically need a website/booking/app.
const SIC = {
  56101: 'Restaurant', 56102: 'Takeaway', 56103: 'Café', 96020: 'Hair & beauty', 96040: 'Wellness', 86230: 'Dental practice', 86900: 'Health practice',
  93130: 'Gym / fitness', 41202: 'Builder', 43210: 'Electrician', 43220: 'Plumbing & heating', 43390: 'Building finishing', 68310: 'Estate agent',
  47910: 'Online retail', 69201: 'Accountant', 69102: 'Solicitor', 81210: 'Cleaning', 88910: 'Childcare', 74209: 'Photography', 85510: 'Sports coaching', 85590: 'Tutoring', 70229: 'Consultancy',
};
const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bLtd\b/g, 'Ltd').replace(/\bLlp\b/g, 'LLP');

async function runCompaniesHouse({ workspaceId, target, job, createdBy, limit, note }) {
  const days = target.filters?.days ?? 7;
  const sic = target.filters?.sicCodes?.length ? target.filters.sicCodes : Object.keys(SIC);
  const qs = new URLSearchParams({
    incorporated_from: new Date(Date.now() - days * 864e5).toISOString().slice(0, 10),
    incorporated_to: new Date().toISOString().slice(0, 10),
    company_status: 'active',
    sic_codes: sic.join(','),
    size: String(Math.min(limit, 500)),
  });
  if (target.cities?.length) qs.set('location', target.cities[0]);
  const d = await getJson(`https://api.company-information.service.gov.uk/advanced-search/companies?${qs}`, {
    headers: { authorization: `Basic ${Buffer.from(`${env.COMPANIES_HOUSE_API_KEY}:`).toString('base64')}` },
  });
  const records = (d.items || []).slice(0, limit).map((c) => {
    const a = c.registered_office_address || {};
    const code = (c.sic_codes || []).find((x) => SIC[x]);
    return {
      name: titleCase(c.company_name),
      placeId: `ch:${c.company_number}`, // dedupe key
      address: [a.address_line_1, a.address_line_2, a.locality, a.postal_code].filter(Boolean).join(', '),
      city: a.locality,
      country: 'GB',
      category: SIC[code] || 'New company',
      companiesHouseUrl: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
    };
  });
  note(`Companies House: ${records.length} new companies (last ${days} days)`);
  if (!records.length) return { found: 0, created: 0 };
  const r = await ingestBatch({ workspaceId, source: 'companieshouse', reference: String(job?._id ?? target._id), records, createdBy });
  return { found: records.length, created: r.created };
}

const PLATFORM_NAMES = { x: 'X', linkedin: 'LinkedIn', threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit', bluesky: 'Bluesky' };

const ADAPTERS = { freelancer: fetchFreelancer, hackernews: fetchHackerNews, tenders: fetchTenders, bluesky: fetchBluesky, brave: fetchBrave, x: fetchX };

// Never pursue: gambling, adult, covert tracking, firmware/hardware, games.
export const BLOCK_RE =
  /\b(casino|betting|gambling|colou?r prediction|satta|lottery|slot game|adult|onlyfans|escort|dating app for escorts|spy(ware)?|stalk|silent (\w+ )?(screenshot|recording|tracking)|keylogger|hack(ing)? (account|whatsapp|instagram)|firmware|pcb|arduino|embedded|iot device|unity game|puzzle game|nft mint|crypto trading bot)\b/i;

/** Keyword pre-filter before paying for the AI check. */
export function prefilter(post) {
  const text = `${post.title}\n${post.text}`;
  if (BLOCK_RE.test(text)) return false;
  if (SELLER_RE.test(post.trusted ? post.title : text)) return false;
  if (!BUILD_RE.test(text) && !(post.platform === 'tenders')) return false;
  return post.trusted || HIRE_RE.test(text);
}

/* ------------------------------ runner ------------------------------ */

export async function runIntentTarget({ workspaceId, target, job, createdBy }) {
  const cfg = INTENT_SOURCES[target.source];
  const keywords = [...new Set([...(target.keywords || [])].map((k) => k.trim()).filter(Boolean))];
  const sinceDays = target.filters?.maxAgeDays ?? (target.source === 'tenders' ? 7 : 3);
  const minIntent = target.filters?.minIntent ?? 0.55;
  const limit = job?.requested || target.maxResults || 25;
  const maxChecks = target.filters?.maxChecks ?? 20; // AI calls per run (free Gemini quota)
  const stats = { checked: 0, filtered: 0, duplicates: 0, notBuyer: 0, lowIntent: 0 };
  const log = [];
  const note = (line) => log.length < 200 && log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  let found = 0;
  let created = 0;
  const progress = async (patch) => {
    if (!job) return;
    Object.assign(job, patch, { stats: { ...stats }, log: [...log] });
    await job.save().catch(() => {});
    emitToWorkspace(workspaceId, 'scrape:progress', { scrapeJobId: job._id, status: job.status, found: job.found, ingested: job.ingested });
  };
  await progress({ status: 'running', startedAt: new Date() });
  try {
    const missing = missingKeys(target.source);
    if (missing.length) throw new Error(`${cfg.label} is not set up — add ${missing.join(', ')} to the server .env`);

    if (cfg.business) {
      const r = await runCompaniesHouse({ workspaceId, target, job, createdBy, limit, note });
      await progress({ status: 'enriched', found: r.found, ingested: r.created, finishedAt: new Date() });
      return r;
    }

    const posts = await ADAPTERS[target.source]({ workspaceId, target, keywords, sinceDays, filters: target.filters || {} });
    note(`${cfg.label}: ${posts.length} items read`);
    let checks = 0;
    for (const post of posts.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))) {
      if (created >= limit) break;
      stats.checked += 1;
      if (!prefilter(post)) {
        stats.filtered += 1;
        continue;
      }
      if ((await Lead.exists({ workspaceId, 'intent.externalId': post.id })) || (await SocialSeen.exists({ workspaceId, externalId: post.id }))) {
        stats.duplicates += 1;
        continue;
      }
      if (checks >= maxChecks) {
        note(`AI check limit (${maxChecks}) reached — the rest are checked next run`);
        break;
      }
      checks += 1;
      found += 1;
      let q = await qualify({ ...post, replyStyle: post.replyStyle || cfg.replyStyle });
      if (!q.ai) {
        if (!post.trusted) {
          note(`skipped (AI unavailable): ${post.title.slice(0, 80)}`);
          continue; // not remembered — retried next run
        }
        q = { ...q, role: 'buyer', intent: 0.7, need: post.title, reply: '' };
      }
      const remember = () =>
        SocialSeen.updateOne({ workspaceId, externalId: post.id }, { $setOnInsert: { workspaceId, externalId: post.id, role: q.role, intent: q.intent } }, { upsert: true }).catch(() => {});
      if (q.role !== 'buyer') {
        await remember();
        stats.notBuyer += 1;
        note(`skipped (${q.role}): ${post.title.slice(0, 90)}`);
        continue;
      }
      if (q.intent < minIntent) {
        await remember();
        stats.lowIntent += 1;
        note(`skipped (intent ${Math.round(q.intent * 100)}%): ${post.title.slice(0, 90)}`);
        continue;
      }
      if (post.budget && !/budget/i.test(q.need)) q.need = `${q.need} · ${post.budget}`;
      const r = await saveIntentLead({ workspaceId, post, q, targetId: job?._id ?? target._id });
      if (r.created) {
        created += 1;
        note(`NEW LEAD: ${post.title.slice(0, 90)}`);
      }
      if (checks % 5 === 0) await progress({ found, ingested: created });
    }
    await progress({ status: 'enriched', found, ingested: created, finishedAt: new Date() });
    return { found, created };
  } catch (err) {
    note(`failed: ${err.message}`);
    await progress({ status: 'failed', error: String(err.message).slice(0, 500), finishedAt: new Date() });
    return { found, created, error: err.message };
  }
}

export async function startIntentJob({ workspaceId, scrapeTargetId, createdBy, scheduleId, maxResults, wait = false }) {
  const target = await ScrapeTarget.findOne({ workspaceId, _id: scrapeTargetId });
  if (!target) throw new Error('Lead source not found');
  const job = await ScrapeJob.create({ workspaceId, createdBy, scrapeTargetId, scheduleId, status: 'queued', requested: maxResults ?? target.maxResults ?? 25 });
  const p = runIntentTarget({ workspaceId, target, job, createdBy }).catch((err) => logger.error({ err }, 'intent run failed'));
  if (wait) await p;
  return job;
}
