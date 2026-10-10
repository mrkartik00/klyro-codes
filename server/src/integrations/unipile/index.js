// Unipile integration — pull LinkedIn (and later IG/WhatsApp) profiles and send
// DMs for social outreach. Key + base URL come from the admin secret store
// (deploy-proof). All failures are reported to the integration status board.
//
// Docs: https://developer.unipile.com — endpoints used:
//   GET  /api/v1/accounts
//   GET  /api/v1/users/{identifier}?account_id=...        (profile)
//   POST /api/v1/chats                                     (start chat / send DM)
import { cfg } from '../../config/secrets.js';
import { logger } from '../../config/logger.js';
import { reportOk, reportIssue, reasonFor } from '../../services/integrationStatus.service.js';

const TIMEOUT = 30000;

function conf() {
  const key = cfg('UNIPILE_API_KEY');
  const base = (cfg('UNIPILE_BASE_URL') || '').replace(/\/$/, '');
  if (!key || !base) return null;
  return { key, base };
}

async function call(path, { method = 'GET', body } = {}) {
  const c = conf();
  if (!c) throw new Error('Unipile is not configured — set UNIPILE_API_KEY and UNIPILE_BASE_URL');
  const res = await fetch(`${c.base}${path}`, {
    method,
    headers: {
      'X-API-KEY': c.key,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  if (!res.ok) {
    reportIssue('unipile', reasonFor(res.status, text));
    const err = new Error(`Unipile ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  reportOk('unipile');
  return text ? JSON.parse(text) : {};
}

/** List connected Unipile accounts (used by the admin "test connection"). */
export async function listAccounts() {
  const data = await call('/api/v1/accounts');
  return (data.items || []).map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    status: a.sources?.[0]?.status || 'UNKNOWN',
  }));
}

/** Extract the public identifier from a LinkedIn profile URL. */
export function linkedinIdentifier(url) {
  if (!url) return null;
  return String(url)
    .replace(/\/$/, '')
    .split('/')
    .pop();
}

/**
 * Pull a LinkedIn profile + recent posts for personalisation.
 * Returns null fields gracefully if the profile is restricted.
 */
export async function pullProfile({ channel = 'linkedin', profileUrl, providerId, pullAccountId, accountId }) {
  const acct = pullAccountId || accountId;
  const ident = providerId || linkedinIdentifier(profileUrl);
  if (!acct || !ident) throw new Error('pullProfile needs an account id and a profile identifier');
  try {
    const profile = await call(`/api/v1/users/${encodeURIComponent(ident)}?account_id=${encodeURIComponent(acct)}`);
    let posts = [];
    try {
      const p = await call(`/api/v1/users/${encodeURIComponent(profile.provider_id || ident)}/posts?limit=5&account_id=${encodeURIComponent(acct)}`);
      posts = (p.items || []).map((x) => x.text || x.commentary || '').filter(Boolean).slice(0, 5);
    } catch {
      // Posts are best-effort; a restricted profile still yields headline/bio.
    }
    return {
      providerId: profile.provider_id || profile.id || ident,
      headline: profile.headline || null,
      bio: profile.summary || profile.about || null,
      company: profile.company_name || profile.current_company || null,
      recentPosts: posts,
    };
  } catch (err) {
    logger.warn({ err, channel, ident }, 'unipile pullProfile failed');
    throw err;
  }
}

/**
 * Send a DM. Returns { providerMessageId, threadId }.
 * `to` is the recipient provider id (preferred) or a profile URL identifier.
 */
export async function sendMessage({ accountId, to, text }) {
  if (!accountId || !to || !text) throw new Error('sendMessage needs accountId, to and text');
  const data = await call('/api/v1/chats', {
    method: 'POST',
    body: { account_id: accountId, attendees_ids: [to], text },
  });
  return {
    providerMessageId: data.message_id || data.id || null,
    threadId: data.chat_id || data.thread_id || null,
  };
}

export function unipileConfigured() {
  return Boolean(conf());
}
