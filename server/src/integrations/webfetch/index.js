// Fetch a prospect's website HTML/markdown for enrichment (email discovery,
// audit). Tries providers in order and returns the first success:
//   1. Firecrawl   — JS-rendered, LLM-ready markdown + links   (free 1k pages/mo)
//   2. ScrapingBee — rotating proxies + headless browser         (free 1k credits)
//   3. plain fetch — no key, best-effort for simple static sites
// Every provider is optional; one without its key is skipped. All failures are
// reported to the integration status board so the admin can see why.
import { cfg } from '../../config/secrets.js';
import { logger } from '../../config/logger.js';
import { reportOk, reportIssue, reasonFor } from '../../services/integrationStatus.service.js';

const UA = 'klyro-lead-finder/1.0 (+https://klyro.codes; admin@klyro.codes)';
const TIMEOUT = 25000;

/** Firecrawl v1 scrape → { html, markdown, links }. Null if no key/failure. */
export async function fetchWithFirecrawl(url) {
  const key = cfg('FIRECRAWL_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'links'], onlyMainContent: false }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      reportIssue('firecrawl', reasonFor(res.status, await res.text().catch(() => '')));
      return null;
    }
    const data = await res.json();
    reportOk('firecrawl');
    return { provider: 'firecrawl', markdown: data?.data?.markdown || '', html: data?.data?.html || '', links: data?.data?.links || [] };
  } catch (err) {
    reportIssue('firecrawl', reasonFor(err.name));
    logger.warn({ err, url }, 'firecrawl fetch failed');
    return null;
  }
}

/** ScrapingBee v1 → rendered HTML string. Null if no key/failure. */
export async function fetchWithScrapingBee(url, { renderJs = false } = {}) {
  const key = cfg('SCRAPINGBEE_API_KEY');
  if (!key) return null;
  try {
    const qs = new URLSearchParams({ api_key: key, url, render_js: renderJs ? 'true' : 'false' });
    const res = await fetch(`https://app.scrapingbee.com/api/v1?${qs}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) {
      reportIssue('scrapingbee', reasonFor(res.status, await res.text().catch(() => '')));
      return null;
    }
    reportOk('scrapingbee');
    return { provider: 'scrapingbee', html: await res.text(), markdown: '', links: [] };
  } catch (err) {
    reportIssue('scrapingbee', reasonFor(err.name));
    logger.warn({ err, url }, 'scrapingbee fetch failed');
    return null;
  }
}

/** Plain fetch fallback (no key). */
async function fetchPlain(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
    if (!res.ok) return null;
    return { provider: 'plain', html: await res.text(), markdown: '', links: [] };
  } catch {
    return null;
  }
}

/**
 * Optional self-hosted Scrapling sidecar (Python). If SCRAPLING_URL is set we
 * POST { url } and expect { html }. Scrapling cannot run inside Node, so this
 * is only used when the user has deployed the sidecar separately.
 */
async function fetchWithScrapling(url) {
  const base = cfg('SCRAPLING_URL');
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      reportIssue('scrapling', reasonFor(res.status, await res.text().catch(() => '')));
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!data?.html) return null;
    reportOk('scrapling');
    return { provider: 'scrapling', html: data.html, markdown: data.markdown || '', links: data.links || [] };
  } catch (err) {
    reportIssue('scrapling', reasonFor(err.name));
    return null;
  }
}

/**
 * Fetch a page using the best available provider. Returns
 * { provider, html, markdown, links } or null if every provider failed.
 */
export async function fetchSite(url, { renderJs = false } = {}) {
  if (!url) return null;
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    (await fetchWithFirecrawl(target)) ||
    (await fetchWithScrapingBee(target, { renderJs })) ||
    (await fetchWithScrapling(target)) ||
    (await fetchPlain(target))
  );
}

export const webfetchReady = () => Boolean(cfg('FIRECRAWL_API_KEY') || cfg('SCRAPINGBEE_API_KEY') || cfg('SCRAPLING_URL'));
