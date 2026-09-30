// Social listening: find people who want to HIRE someone to build a website,
// web app or Android/iOS app — not developers/agencies looking for clients.
//
// Reddit — two kinds of sources:
//   • hiring boards (r/forhire, r/b2bforhire, …): newest posts, [Hiring] only
//   • general subs (r/startups, r/Entrepreneur, …): searched with buyer phrases
// Each post passes a strict keyword filter (builds something we make + wants
// to hire + not a seller/job seeker), then Gemini classifies the author's role;
// only "buyer" posts become leads, with a drafted reply in Approvals that YOU
// post (no automated posting). If REDDIT_CLIENT_ID/SECRET are set, the
// official OAuth API is used; otherwise public RSS feeds.
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateJson } from '../integrations/gemini/index.js';
import { redactPii } from '../utils/pii.js';
import { withTransaction } from '../utils/transaction.js';
import { Organization } from '../models/Organization.js';
import { Contact } from '../models/Contact.js';
import { Lead } from '../models/Lead.js';
import { LeadSource } from '../models/LeadSource.js';
import { Approval } from '../models/Approval.js';
import { ScrapeTarget, ScrapeJob } from '../models/ScrapeTarget.js';
import { emitToWorkspace } from '../socket/index.js';

const UA = 'klyro-lead-finder/1.0 (+https://klyro.codes; admin@klyro.codes)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What we build (word-bounded: "app" must not match "appointment").
export const BUILD_RE =
  /\b(website|web ?site|web ?app|webapp|landing page|mobile app|android( app)?|ios( app)?|iphone app|ipad app|react native|flutter|app developer|app development|app dev|web developer|web development|web dev|full.?stack|shopify|woocommerce|wordpress|webflow|e-?commerce|online store|booking (system|site|app)|mvp|saas|customer portal|dashboard)\b|\b(an?|my|our|the) ([a-z-]+ ){0,2}apps?\b|\bapps? (like|for)\b/i;

// Someone who wants to PAY someone else to build it.
export const HIRE_RE =
  /(\[hiring\]|\[task\]|\[paid\]|\b(hiring|to hire|want to hire|looking to hire|looking for (a|an|someone|developers?|an? agency|freelancers?|a dev|a team)|need (a|an|someone|developers?|help building|help to build|it built|this built)|seeking (a|an)? ?(developer|agency|freelancer)|recommend (a|an)? ?(developer|agency|freelancer|dev shop)|who can (build|make|develop)|anyone (who can|able to) (build|make|develop)|quote (for|to) (build|develop|make)|how much (would|does|to|will) (it )?cost to (build|make|develop)|paying|will pay|dev shop|development (agency|company|partner)|outsourc(e|ing))\b)/i;

// Developers, agencies and job seekers — the people we compete with.
export const SELLER_RE =
  /(\[for ?hire\]|\[offer\]|\[offering\]|\bhire me\b|\bdm me\b|how (do|can|did|to) (i|you|we)? ?(get|find|land|attract) (more )?(clients|customers|leads)|(looking for|finding|find|get(ting)?|land(ing)?) (new |more |first )?clients|my (agency|portfolio|services|studio)|\bour (agency|services)\b|\bwe (build|develop|design|create|make) (websites|apps|web|mobile)|i('?m| am) an? (freelance |professional |experienced |senior |junior |self.taught )?(web |app |mobile |full.?stack |front.?end |back.?end |software |react |flutter |ios |android |wordpress |shopify )?(developer|designer|dev|engineer|agency|freelancer|programmer)|offering (my )?(web|app|development|design) services|free work for (my )?portfolio|available for (work|projects|hire)|open (to|for) (work|projects|new projects)|job seeker|looking for (a )?(job|work|internship|gig|remote work))/i;

// Hiring boards: only posts tagged as hiring count. Keys are lower-case.
export const HIRING_BOARDS = {
  forhire: /\[(hiring|hire)\]/i,
  freelance_forhire: /\[(hiring|hire)\]/i,
  b2bforhire: /\[(hiring|hire)\]/i,
  hireaprogrammer: /./,
  slavelabour: /\[(task|hiring)\]/i,
  donedirtcheap: /\[(task|hiring)\]/i,
  jobbit: /hiring/i,
};

export const DEFAULT_COMMUNITIES = ['forhire', 'b2bforhire', 'hireaprogrammer', 'startups', 'Entrepreneur', 'smallbusiness', 'ecommerce', 'SaaS'];
export const DEFAULT_QUERIES = [
  'looking for a developer',
  'hire a developer',
  'need an app built',
  'looking for an agency',
  'need a website built',
  'app development company',
  'developer to build',
];

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}
const stripHtml = (html) =>
  decodeEntities(decodeEntities(html))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/submitted by\s+\/u\/\S+\s*\[link\]\s*\[comments\]/i, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Parse a Reddit Atom feed into posts. */
export function parseRedditFeed(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const pick = (re) => (e.match(re) || [])[1];
    const id = pick(/<id>([^<]+)<\/id>/);
    if (!id || !id.startsWith('t3_')) continue; // posts only
    const author = decodeEntities(pick(/<author>\s*<name>([^<]+)<\/name>/) || '').replace(/^\/?u\//, '');
    out.push({
      id,
      title: decodeEntities(pick(/<title>([\s\S]*?)<\/title>/) || '').trim(),
      author,
      url: decodeEntities(pick(/<link href="([^"]+)"/) || ''),
      community: pick(/<category term="([^"]+)"/) || '',
      postedAt: pick(/<published>([^<]+)<\/published>/) || pick(/<updated>([^<]+)<\/updated>/),
      text: stripHtml(pick(/<content[^>]*>([\s\S]*?)<\/content>/) || '').slice(0, 4000),
    });
  }
  return out;
}

let oauth = { token: null, until: 0 };
async function redditToken() {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return null;
  if (oauth.token && Date.now() < oauth.until) return oauth.token;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Reddit auth failed (${res.status})`);
  const d = await res.json();
  oauth = { token: d.access_token, until: Date.now() + (d.expires_in - 60) * 1000 };
  return oauth.token;
}

const fromApi = ({ data: p }) => ({
  id: `t3_${p.id}`,
  title: p.title,
  author: p.author,
  url: `https://www.reddit.com${p.permalink}`,
  community: p.subreddit,
  postedAt: new Date(p.created_utc * 1000).toISOString(),
  text: String(p.selftext || '').slice(0, 4000),
});

async function redditGet(apiPath, rssPath) {
  const token = await redditToken().catch((err) => {
    logger.warn({ err }, 'reddit oauth failed; falling back to RSS');
    return null;
  });
  if (token) {
    const res = await fetch(`https://oauth.reddit.com${apiPath}`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Reddit API ${res.status}`);
    return ((await res.json())?.data?.children || []).map(fromApi);
  }
  const res = await fetch(`https://www.reddit.com${rssPath}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Reddit feed ${res.status}`);
  return parseRedditFeed(await res.text());
}

/** Search one subreddit for any of the phrases (one request, newest first). */
export async function searchReddit({ community, query, queries, maxAgeDays = 14 }) {
  const t = maxAgeDays <= 1 ? 'day' : maxAgeDays <= 7 ? 'week' : maxAgeDays <= 31 ? 'month' : 'year';
  const list = (queries?.length ? queries : [query]).filter(Boolean);
  const text = list.length > 1 ? list.map((x) => `"${x.replace(/"/g, '')}"`).join(' OR ') : list[0];
  const q = new URLSearchParams({ q: text, restrict_sr: '1', sort: 'new', t, limit: '100' });
  const sub = encodeURIComponent(community);
  return redditGet(`/r/${sub}/search?${q}`, `/r/${sub}/search.rss?${q}`);
}

/** Newest posts in a community (used for hiring boards). */
export async function latestReddit({ community }) {
  const sub = encodeURIComponent(community);
  return redditGet(`/r/${sub}/new?limit=100`, `/r/${sub}/new.rss?limit=100`);
}

/**
 * Cheap first pass before the AI: recent, about something we build, the author
 * wants to hire someone (or it's a [Hiring] post on a hiring board), and it's
 * not a developer/agency/job seeker.
 */
export function looksLikeBuyer(post, { maxAgeDays = 14 } = {}) {
  const text = `${post.title}\n${post.text}`;
  if (!post.author || ['[deleted]', 'AutoModerator'].includes(post.author)) return false;
  const age = (Date.now() - new Date(post.postedAt).getTime()) / 864e5;
  if (Number.isFinite(age) && age > maxAgeDays) return false;
  const board = HIRING_BOARDS[String(post.community || '').toLowerCase()];
  if (board) {
    // On hiring boards the title says who is hiring what; the body is often a
    // company description ("our agency…") that must not disqualify the post.
    return board.test(post.title) && BUILD_RE.test(post.title) && !SELLER_RE.test(post.title);
  }
  if (SELLER_RE.test(text)) return false;
  if (!BUILD_RE.test(text)) return false;
  return HIRE_RE.test(text);
}

/** Keyword score, used only when Gemini is unavailable. Strict by design. */
export function heuristicIntent(post) {
  const t = `${post.title}\n${post.text}`;
  if (SELLER_RE.test(t) || !BUILD_RE.test(t) || !HIRE_RE.test(t)) return 0.15;
  let s = 0.6;
  if (/\[(hiring|task|paid)\]/i.test(post.title)) s += 0.1;
  if (/(\bbudget\b|\bpaying\b|\bwill pay\b|\$\s?\d|\busd\b|£\s?\d|per hour|\/hr\b|fixed price)/i.test(t)) s += 0.15;
  if (/\b(my|our) (business|company|startup|shop|store|restaurant|clinic|salon|brand)\b/i.test(t)) s += 0.05;
  return Math.min(0.9, s);
}

function intentPrompt(post) {
  const body = redactPii(post.text).slice(0, 2500);
  return [
    'You qualify leads for Klyro, an agency that builds websites, web apps and Android/iOS mobile apps for clients.',
    'We ONLY want people or businesses who want to HIRE and PAY someone (a freelancer, developer or agency) to build a website, web app or mobile app for them.',
    'Classify the author of this public Reddit post. Return strict JSON:',
    '{"role": one of ["buyer","diy","seller","job_seeker","other"],',
    ' "intent": number 0-1 (only for role "buyer": how likely they hire within weeks; otherwise 0),',
    ' "project": one of ["website","web_app","mobile_app","ecommerce","other"],',
    ' "need": string (max 15 words: what they want built),',
    ' "budget": string (stated budget, or ""),',
    ' "business": string (their business type, or ""),',
    ' "reply": string (only for buyers: a helpful public reply, 60-110 words, answer or advise first, mention that Klyro builds this only in the last sentence, no links, no emojis; otherwise "")}',
    'Roles:',
    '- buyer: wants someone else to build it and would pay (hiring posts, "looking for a developer/agency", "need an app built", asking for quotes or dev recommendations).',
    '- diy: wants to build it themselves, or only asks which platform/tool to use.',
    '- seller: a developer, designer, agency or freelancer offering services, sharing work, or asking how to get clients.',
    '- job_seeker: looking for a job, internship or paid work.',
    '- other: anything else.',
    `Title: ${post.title}`,
    `Subreddit: r/${post.community}`,
    `Post: <<<${body}>>>`,
  ].join('\n');
}

const REPLY_FALLBACK =
  "Happy to help. Before choosing anyone, write down the 3-4 things it must do (bookings, payments, logins), your budget range and timeline, and ask each developer for a similar project they've shipped. That makes quotes easy to compare. We build websites and mobile apps like this at Klyro if you'd like a quote.";

export async function qualify(post) {
  const ai = await generateJson(intentPrompt(post)).catch(() => null);
  if (ai && typeof ai.role === 'string') {
    const buyer = ai.role === 'buyer';
    const need = [ai.need || post.title, ai.budget ? `budget ${ai.budget}` : ''].filter(Boolean).join(' · ');
    return {
      intent: buyer ? Math.max(0, Math.min(1, Number(ai.intent) || 0)) : 0,
      role: ai.role,
      project: ai.project || 'other',
      need,
      business: ai.business || '',
      reply: buyer ? ai.reply || REPLY_FALLBACK : '',
      ai: true,
    };
  }
  const intent = heuristicIntent(post);
  const buyer = intent >= 0.55;
  return {
    intent,
    role: buyer ? 'buyer' : 'other',
    project: /android|ios|mobile app|iphone|flutter|react native/i.test(`${post.title} ${post.text}`) ? 'mobile_app' : 'website',
    need: post.title,
    business: '',
    reply: buyer ? REPLY_FALLBACK : '',
    ai: false,
  };
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/i;
const cap = (s, n) => String(s ?? '').slice(0, n);
const PROJECT_LABEL = { website: 'Website', web_app: 'Web app', mobile_app: 'Mobile app', ecommerce: 'Online store', other: 'Project' };

/** Save one qualified post as a lead (+ contact, + reply draft). Idempotent per post. */
export async function saveRedditLead({ workspaceId, post, q, targetId }) {
  const exists = await Lead.findOne({ workspaceId, 'intent.externalId': post.id }).select('_id').lean();
  if (exists) return { created: false, leadId: exists._id };
  return withTransaction(async (session) => {
    const handle = `u/${post.author}`;
    const profile = `https://www.reddit.com/user/${post.author}`;
    const [org] = await Organization.create(
      [
        {
          workspaceId,
          name: `${PROJECT_LABEL[q.project] || 'Project'}: ${cap(q.need, 70)} (${handle})`,
          category: q.business || undefined,
          socials: { reddit: profile },
        },
      ],
      { session, ordered: true },
    );
    const email = (post.text.match(EMAIL_RE) || [])[0]?.toLowerCase();
    const contact = email
      ? await Contact.findOneAndUpdate(
          { workspaceId, email },
          {
            $setOnInsert: {
              workspaceId,
              organizationId: org._id,
              email,
              name: post.author,
              emailStatus: 'unknown',
              handles: { reddit: handle },
              socials: { reddit: profile },
            },
          },
          { upsert: true, new: true, session },
        )
      : (
          await Contact.create([{ workspaceId, organizationId: org._id, name: post.author, handles: { reddit: handle }, socials: { reddit: profile } }], {
            session,
            ordered: true,
          })
        )[0];
    const [lead] = await Lead.create(
      [
        {
          workspaceId,
          organizationId: org._id,
          primaryContactId: contact._id,
          source: 'reddit',
          sourceUrl: post.url,
          stage: 'new',
          score: Math.round(q.intent * 100),
          scoreBreakdown: { reasons: [`wants to hire · ${PROJECT_LABEL[q.project] || 'project'} · intent ${Math.round(q.intent * 100)}%${q.ai ? '' : ' (keyword estimate)'}`] },
          tags: ['reddit', `r/${post.community}`.toLowerCase(), q.project].filter(Boolean),
          notes: q.need,
          intent: {
            score: q.intent,
            need: cap(q.need, 200),
            title: cap(post.title, 300),
            text: cap(post.text, 4000),
            community: `r/${post.community}`,
            author: handle,
            postedAt: post.postedAt ? new Date(post.postedAt) : undefined,
            externalId: post.id,
          },
        },
      ],
      { session, ordered: true },
    );
    await LeadSource.create([{ workspaceId, leadId: lead._id, channel: 'reddit', reference: String(targetId ?? ''), raw: { id: post.id, url: post.url } }], {
      session,
      ordered: true,
    });
    // A reply you post yourself on Reddit (shown in Approvals with Open/Copy).
    if (q.reply) {
      await Approval.create(
        [
          {
            workspaceId,
            leadId: lead._id,
            stepOrder: 0,
            channel: 'reddit',
            status: 'pending',
            draft: { subject: cap(post.title, 200), body: q.reply, personalizationNotes: post.url },
          },
        ],
        { session, ordered: true },
      );
    }
    return { created: true, leadId: lead._id };
  });
}

/** Run one reddit lead source end-to-end, tracking progress on a ScrapeJob. */
export async function runRedditTarget({ workspaceId, target, job }) {
  const communities = (target.communities || []).map((c) => c.replace(/^\/?r\//i, '').trim()).filter(Boolean);
  const queries = [...new Set([...(target.keywords || []), ...(target.categories || [])].map((k) => k.trim()).filter(Boolean))];
  const maxAgeDays = target.filters?.maxAgeDays ?? 14;
  const minIntent = target.filters?.minIntent ?? 0.55;
  const limit = target.maxResults ?? 50;
  const seen = new Set();
  let found = 0;
  let created = 0;
  const progress = async (patch) => {
    if (!job) return;
    Object.assign(job, patch);
    await job.save().catch(() => {});
    emitToWorkspace(workspaceId, 'scrape:progress', { scrapeJobId: job._id, status: job.status, found: job.found, ingested: job.ingested });
  };
  await progress({ status: 'running', startedAt: new Date() });
  // Without an API key Reddit allows only a few requests a minute, so each run
  // covers the next 3 subreddits (round-robin); with a key, all of them.
  const all = communities.length ? communities : DEFAULT_COMMUNITIES;
  const perRun = env.REDDIT_CLIENT_ID ? all.length : Math.min(3, all.length);
  const start = (target.filters?.cursor ?? 0) % all.length;
  const batch = Array.from({ length: perRun }, (_, i) => all[(start + i) % all.length]);
  try {
    if (target.save) {
      target.filters = { ...(target.filters?.toObject?.() ?? target.filters ?? {}), cursor: (start + perRun) % all.length };
      target.markModified?.('filters');
      await target.save().catch(() => {});
    }
    for (const community of batch) {
      if (created >= limit) break;
      const board = Boolean(HIRING_BOARDS[community.toLowerCase()]);
      // One request per community (phrases OR-ed) keeps us well under Reddit's
      // rate limit; on 429, wait a minute and try once more.
      const fetchPosts = () =>
        board ? latestReddit({ community }) : searchReddit({ community, queries: queries.length ? queries : DEFAULT_QUERIES, maxAgeDays });
      {
        let posts = [];
        try {
          posts = await fetchPosts();
        } catch (err) {
          if (/429/.test(err.message)) {
            await sleep(60000);
            posts = await fetchPosts().catch(() => []);
          } else {
            logger.warn({ err, community }, 'reddit fetch failed');
          }
        }
        for (const post of posts) {
          if (seen.has(post.id) || created >= limit) continue;
          seen.add(post.id);
          if (!looksLikeBuyer(post, { maxAgeDays })) continue;
          if (await Lead.exists({ workspaceId, 'intent.externalId': post.id })) continue;
          found += 1;
          const q = await qualify(post);
          if (q.role !== 'buyer' || q.intent < minIntent) continue;
          const r = await saveRedditLead({ workspaceId, post, q, targetId: target._id });
          if (r.created) created += 1;
        }
        await progress({ found, ingested: created });
        await sleep(6000); // be polite to Reddit
      }
    }
    await progress({ status: 'enriched', found, ingested: created, finishedAt: new Date() });
    return { found, created };
  } catch (err) {
    await progress({ status: 'failed', error: String(err.message).slice(0, 500), finishedAt: new Date() });
    throw err;
  }
}

/** Start a reddit run in the background; returns the job immediately. */
export async function startRedditJob({ workspaceId, scrapeTargetId, createdBy }) {
  const target = await ScrapeTarget.findOne({ workspaceId, _id: scrapeTargetId });
  if (!target) throw new Error('Lead source not found');
  const job = await ScrapeJob.create({ workspaceId, createdBy, scrapeTargetId, status: 'queued', requested: target.maxResults ?? 50 });
  runRedditTarget({ workspaceId, target, job }).catch((err) => logger.error({ err }, 'reddit run failed'));
  return job;
}

/** Scheduled scan (n8n every 30 min): all active reddit sources in a workspace. */
export async function scanAllReddit({ workspaceId }) {
  const targets = await ScrapeTarget.find({ workspaceId, source: 'reddit', active: true, deletedAt: null });
  const results = [];
  for (const target of targets) {
    const job = await ScrapeJob.create({ workspaceId, scrapeTargetId: target._id, status: 'queued', requested: target.maxResults ?? 50 });
    results.push({ target: target.name, ...(await runRedditTarget({ workspaceId, target, job }).catch((e) => ({ error: e.message }))) });
  }
  return results;
}
