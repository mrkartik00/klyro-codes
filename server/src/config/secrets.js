// Editable API keys: values set in the admin (Settings → API keys) are stored
// encrypted in MongoDB and override the .env value; removing one falls back to
// .env. Reads are synchronous (cfg('NAME')) from an in-memory copy that is
// refreshed every 30 s, so every API process picks up changes without restart.
import { env } from './env.js';
import { logger } from './logger.js';

export const SECRET_PREFIX = 'secret:';

// Every key the admin can manage, grouped by integration.
export const INTEGRATIONS = [
  {
    id: 'gemini',
    name: 'Gemini AI',
    use: 'Buyer checks, drafts, reply classification',
    url: 'https://aistudio.google.com/apikey',
    keys: [
      { name: 'GEMINI_API_KEY', label: 'API key', secret: true, hint: 'Several keys: separate with commas — used one after another when a quota runs out.' },
      { name: 'GEMINI_MODEL', label: 'Main model', hint: 'default gemini-flash-latest' },
      { name: 'GEMINI_FALLBACK_MODEL', label: 'Fallback model', hint: 'default gemini-flash-lite-latest' },
    ],
  },
  { id: 'brave', name: 'Brave Search', use: 'RFP / public post web search', url: 'https://api-dashboard.search.brave.com', keys: [{ name: 'BRAVE_API_KEY', label: 'API key(s)', secret: true, hint: 'Comma-separate several free keys (~950 searches each / month).' }] },
  {
    id: 'bluesky',
    name: 'Bluesky',
    use: 'Post search',
    url: 'https://bsky.app/settings/app-passwords',
    keys: [
      { name: 'BSKY_HANDLE', label: 'Handle', hint: 'e.g. name.bsky.social' },
      { name: 'BSKY_APP_PASSWORD', label: 'App password', secret: true },
    ],
  },
  { id: 'companieshouse', name: 'Companies House', use: 'New UK companies', url: 'https://developer.company-information.service.gov.uk/manage-applications', keys: [{ name: 'COMPANIES_HOUSE_API_KEY', label: 'REST API key', secret: true }] },
  {
    id: 'googleplaces',
    name: 'Google Places',
    use: 'Find businesses (name, website, phone) by text search',
    url: 'https://console.cloud.google.com/google/maps-apis/credentials',
    keys: [{ name: 'GOOGLE_PLACES_API_KEY', label: 'API key', secret: true, hint: 'Enable "Places API (New)". Free: $200/month credit.' }],
  },
  {
    id: 'apify',
    name: 'Apify',
    use: 'Run scraper Actors (Google Maps, directories) across the web',
    url: 'https://console.apify.com/settings/integrations',
    keys: [
      { name: 'APIFY_TOKEN', label: 'API token', secret: true, hint: 'Free: $5/month credit, renews monthly, no card.' },
      { name: 'APIFY_PLACES_ACTOR', label: 'Places actor', hint: 'default compass~crawler-google-places' },
    ],
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    use: 'Fetch & read any website (JS-rendered) for enrichment',
    url: 'https://www.firecrawl.dev/app/api-keys',
    keys: [{ name: 'FIRECRAWL_API_KEY', label: 'API key', secret: true, hint: 'Free: 1,000 pages/month.' }],
  },
  {
    id: 'scrapingbee',
    name: 'ScrapingBee',
    use: 'Fetch any website via rotating proxies + headless browser (enrichment fallback)',
    url: 'https://app.scrapingbee.com/account/manage-api-key',
    keys: [{ name: 'SCRAPINGBEE_API_KEY', label: 'API key', secret: true, hint: 'Free: 1,000 credits.' }],
  },
  {
    id: 'scrapling',
    name: 'Scrapling (self-hosted)',
    use: 'Python stealth scraper — runs as a separate sidecar, no API key',
    url: 'https://github.com/D4Vinci/Scrapling',
    keys: [{ name: 'SCRAPLING_URL', label: 'Sidecar URL', hint: 'Optional: URL of a self-hosted Scrapling HTTP sidecar. Left blank = not used.' }],
  },
  {
    id: 'x',
    name: 'X (official API)',
    use: 'X post search (paid per read)',
    url: 'https://developer.x.com/en/portal/dashboard',
    keys: [
      { name: 'X_BEARER_TOKEN', label: 'Bearer token', secret: true },
      { name: 'X_MONTHLY_READ_CAP', label: 'Monthly read cap', hint: 'Hard limit on paid post reads (≈ $0.005 each). Default 3000.' },
    ],
  },
  { id: 'sam', name: 'SAM.gov', use: 'US federal tenders', url: 'https://sam.gov/profile/details', keys: [{ name: 'SAM_API_KEY', label: 'Public API key', secret: true }] },
  {
    id: 'reddit',
    name: 'Reddit API',
    use: 'Optional — faster Reddit reads (Arctic Shift is used without it)',
    url: 'https://www.reddit.com/prefs/apps',
    keys: [
      { name: 'REDDIT_CLIENT_ID', label: 'Client ID' },
      { name: 'REDDIT_CLIENT_SECRET', label: 'Client secret', secret: true },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    use: 'Alerts + morning digest',
    url: 'https://t.me/BotFather',
    keys: [
      { name: 'TELEGRAM_BOT_TOKEN', label: 'Bot token', secret: true },
      { name: 'TELEGRAM_CHAT_ID', label: 'Chat ID' },
    ],
  },
  { id: 'brevo', name: 'Brevo', use: 'Client emails (codes, quotes, invoices)', url: 'https://app.brevo.com/settings/keys/api', keys: [{ name: 'BREVO_API_KEY', label: 'API key', secret: true }] },
  {
    id: 'razorpay',
    name: 'Razorpay',
    use: 'Payments',
    url: 'https://dashboard.razorpay.com/app/website-app-settings/api-keys',
    keys: [
      { name: 'RAZORPAY_KEY_ID', label: 'Key ID' },
      { name: 'RAZORPAY_KEY_SECRET', label: 'Key secret', secret: true },
      { name: 'RAZORPAY_WEBHOOK_SECRET', label: 'Webhook secret', secret: true },
    ],
  },
];
export const KEY_META = Object.fromEntries(INTEGRATIONS.flatMap((i) => i.keys.map((k) => [k.name, { ...k, integration: i.id }])));

let overrides = {}; // name -> plaintext
let loadedAt = 0;
const listeners = new Set();
let timer = null;

/** Current value: admin override, else .env. */
export function cfg(name) {
  const v = overrides[name];
  return v !== undefined && v !== '' ? v : env[name];
}
export const cfgNum = (name, fallback) => {
  const n = Number(cfg(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const overrideSource = (name) => (overrides[name] ? 'admin' : env[name] ? 'env' : null);
/** Run fn(changedNames) whenever keys change (reset caches/sessions). */
export const onSecretsChange = (fn) => listeners.add(fn);

export async function loadSecrets() {
  // Lazy imports: config must not depend on models at import time.
  const [{ Setting }, { decrypt }] = await Promise.all([import('../models/Setting.js'), import('../utils/crypto.js')]);
  const rows = await Setting.find({ key: { $regex: `^${SECRET_PREFIX}` } }).lean();
  const next = {};
  for (const r of rows) {
    const name = r.key.slice(SECRET_PREFIX.length);
    if (!KEY_META[name]) continue;
    try {
      next[name] = r.encrypted ? decrypt(r.value) : String(r.value ?? '');
    } catch (err) {
      logger.error({ err, name }, 'could not decrypt stored key (ENCRYPTION_KEY changed?)');
    }
  }
  const changed = [...new Set([...Object.keys(next), ...Object.keys(overrides)])].filter((k) => next[k] !== overrides[k]);
  overrides = next;
  loadedAt = Date.now();
  if (changed.length) for (const fn of listeners) fn(changed);
  return changed;
}

export function startSecretsRefresh() {
  if (timer) return;
  timer = setInterval(() => loadSecrets().catch((err) => logger.warn({ err }, 'secrets refresh failed')), 30000);
  timer.unref();
}
export const secretsLoadedAt = () => loadedAt;
