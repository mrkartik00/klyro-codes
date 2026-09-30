// Social listening: find people publicly asking for what Klyro sells.
//
// Reddit — reads public search feeds (RSS) for the subreddits/keywords on a
// "reddit" lead source, filters for buying intent (keywords, then Gemini),
// and turns each good post into a lead + a drafted reply in Approvals. Replies
// are posted BY YOU on Reddit (no automated posting — that gets accounts
// banned). If REDDIT_CLIENT_ID/SECRET are set, the official OAuth API is used.
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

// People looking to BUY help, not people selling it.
const BUY_SIGNALS =
  /\b(need(ed|s)?|looking for|recommend(ation)?s?|anyone (know|built|use)|hire|hiring|who (can|could|would)|help (me )?(with|build|make|find)|quote|cost|how much|budget|agency|freelancer|developer|designer|build (me|us|a)|make (me|us|a)|redesign|website|web ?site|landing page|app|online store|booking|shopify|wordpress|wix|squarespace|seo)\b/i;
const SELLER_SIGNALS =
  /(\[for hire\]|\[offer\]|i('| a)m a (web )?(developer|designer|freelancer)|we are an? (agency|studio)|my agency|dm me for|check out my (portfolio|services)|i (build|make|design) websites|hire me)/i;

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

/** Search one subreddit for a keyword (newest first). */
export async function searchReddit({ community, query, maxAgeDays = 14 }) {
  const t = maxAgeDays <= 1 ? 'day' : maxAgeDays <= 7 ? 'week' : maxAgeDays <= 31 ? 'month' : 'year';
  const token = await redditToken().catch((err) => {
    logger.warn({ err }, 'reddit oauth failed; falling back to RSS');
    return null;
  });
  const q = new URLSearchParams({ q: query, restrict_sr: '1', sort: 'new', t, limit: '50' });
  if (token) {
    const res = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(community)}/search?${q}`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Reddit API ${res.status}`);
    const d = await res.json();
    return (d?.data?.children || []).map(({ data: p }) => ({
      id: `t3_${p.id}`,
      title: p.title,
      author: p.author,
      url: `https://www.reddit.com${p.permalink}`,
      community: p.subreddit,
      postedAt: new Date(p.created_utc * 1000).toISOString(),
      text: String(p.selftext || '').slice(0, 4000),
    }));
  }
  const res = await fetch(`https://www.reddit.com/r/${encodeURIComponent(community)}/search.rss?${q}`, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Reddit feed ${res.status}`);
  return parseRedditFeed(await res.text());
}

/** Cheap first pass: a buyer asking for help, recent, not a seller/self-promo. */
export function looksLikeBuyer(post, { maxAgeDays = 14 } = {}) {
  const text = `${post.title}\n${post.text}`;
  if (!post.author || ['[deleted]', 'AutoModerator'].includes(post.author)) return false;
  if (SELLER_SIGNALS.test(text)) return false;
  if (!BUY_SIGNALS.test(text)) return false;
  const age = (Date.now() - new Date(post.postedAt).getTime()) / 864e5;
  return !(Number.isFinite(age) && age > maxAgeDays);
}

/** Heuristic intent score used when Gemini is unavailable. */
export function heuristicIntent(post) {
  const t = `${post.title} ${post.text}`.toLowerCase();
  let s = 0.3;
  if (/\b(need|looking for|hire|hiring|recommend)\b/.test(t)) s += 0.25;
  if (/\b(website|web site|app|landing page|online store|booking)\b/.test(t)) s += 0.2;
  if (/\b(budget|cost|quote|how much|\$\d)/.test(t)) s += 0.15;
  if (/\?/.test(post.title)) s += 0.05;
  return Math.min(0.95, s);
}

function intentPrompt(post) {
  return `You qualify leads for Klyro, a studio that builds websites, web apps and online stores for small businesses (US/UK).
Read this public Reddit post and decide if the author is a potential CLIENT who needs something Klyro builds.
Return strict JSON:
{"intent": number 0-1 (how likely they would pay for a website/app soon),
 "need": string (max 15 words, what they want),
 "business": string (their business type if stated, else ""),
 "reply": string (a genuinely helpful public reply, 60-110 words, answer their question first, no hard sell, mention you build these at Klyro only in the last sentence, no links, no emojis)}
Score 0.1 or lower if they are a developer/agency, just venting, a student project, or not about building something.
Post title: ${post.title}
Subreddit: r/${post.community}
Post: """${redactPii(post.text).slice(0, 2500)}"""`;
}

async function qualify(post) {
  const ai = await generateJson(intentPrompt(post)).catch(() => null);
  if (ai && typeof ai.intent === 'number') {
    return { intent: Math.max(0, Math.min(1, ai.intent)), need: ai.need || post.title, business: ai.business || '', reply: ai.reply || '', ai: true };
  }
  return {
    intent: heuristicIntent(post),
    need: post.title,
    business: '',
    reply: `Happy to help — for something like this I'd start by listing the 3-4 things the site must do (e.g. bookings, payments, contact form), then pick a platform that fits your budget and who will update it. If you'd like a second opinion or a quote, we build sites like this at Klyro.`,
    ai: false,
  };
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/i;
const cap = (s, n) => String(s ?? '').slice(0, n);

/** Save one qualified post as a lead (+ contact, + reply draft). Idempotent per post. */
export async function saveRedditLead({ workspaceId, post, q, targetId }) {
  const exists = await Lead.findOne({ workspaceId, 'intent.externalId': post.id }).select('_id').lean();
  if (exists) return { created: false, leadId: exists._id };
  return withTransaction(async (session) => {
    const handle = `u/${post.author}`;
    const profile = `https://www.reddit.com/user/${post.author}`;
    const [org] = await Organization.create(
      [{ workspaceId, name: `${handle} — ${cap(q.business || q.need, 60)}`, category: q.business || undefined, socials: { reddit: profile } }],
      { session, ordered: true },
    );
    const email = (post.text.match(EMAIL_RE) || [])[0]?.toLowerCase();
    const contact = email
      ? await Contact.findOneAndUpdate(
          { workspaceId, email },
          { $setOnInsert: { workspaceId, organizationId: org._id, email, name: post.author, emailStatus: 'unknown', handles: { reddit: handle }, socials: { reddit: profile } } },
          { upsert: true, new: true, session },
        )
      : (await Contact.create([{ workspaceId, organizationId: org._id, name: post.author, handles: { reddit: handle }, socials: { reddit: profile } }], { session, ordered: true }))[0];
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
          scoreBreakdown: { reasons: [`reddit intent ${Math.round(q.intent * 100)}%${q.ai ? '' : ' (keyword estimate)'}`] },
          tags: ['reddit', `r/${post.community}`.toLowerCase()],
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
        [{ workspaceId, leadId: lead._id, stepOrder: 0, channel: 'reddit', status: 'pending', draft: { subject: cap(post.title, 200), body: q.reply, personalizationNotes: post.url } }],
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
  let checked = 0;
  const progress = async (patch) => {
    if (!job) return;
    Object.assign(job, patch);
    await job.save().catch(() => {});
    emitToWorkspace(workspaceId, 'scrape:progress', { scrapeJobId: job._id, status: job.status, found: job.found, ingested: job.ingested });
  };
  await progress({ status: 'running', startedAt: new Date() });
  try {
    for (const community of communities.length ? communities : ['smallbusiness']) {
      for (const query of queries.length ? queries : ['need a website']) {
        let posts = [];
        try {
          posts = await searchReddit({ community, query, maxAgeDays });
        } catch (err) {
          logger.warn({ err, community, query }, 'reddit search failed');
        }
        for (const post of posts) {
          if (seen.has(post.id) || created >= limit) continue;
          seen.add(post.id);
          if (!looksLikeBuyer(post, { maxAgeDays })) continue;
          if (await Lead.exists({ workspaceId, 'intent.externalId': post.id })) continue;
          found += 1;
          checked += 1;
          const q = await qualify(post);
          if (q.intent < minIntent) continue;
          const r = await saveRedditLead({ workspaceId, post, q, targetId: target._id });
          if (r.created) created += 1;
        }
        await progress({ found, ingested: created });
        await sleep(2500); // be polite to Reddit
      }
    }
    await progress({ status: 'enriched', found, ingested: created, finishedAt: new Date() });
    return { checked, found, created };
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
