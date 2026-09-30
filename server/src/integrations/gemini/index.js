import { cfg } from '../../config/secrets.js';
import { logger } from '../../config/logger.js';
import { reportOk, reportIssue, reasonFor } from '../../services/integrationStatus.service.js';

// Fixed model names get retired (gemini-2.0-flash is gone); the -latest alias
// follows Google's current Flash model. Override with GEMINI_MODEL.
const model = () => cfg('GEMINI_MODEL') || 'gemini-flash-latest';
// Free-tier quotas are per model: when the main model is out of quota (429)
// or retired (404), fall back to Flash-Lite, which has its own larger quota.
const fallbackModel = () => cfg('GEMINI_FALLBACK_MODEL') || 'gemini-flash-lite-latest';
// GEMINI_API_KEY may hold several keys (comma-separated, e.g. from different
// Google accounts); each key × model has its own free quota.
export const geminiKeys = () => String(cfg('GEMINI_API_KEY') || '').split(',').map((k) => k.trim()).filter(Boolean);
export const RETRY_DELAYS_MS = [1500, 4000, 9000];
const URL = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

// A key+model that answered 429 is skipped for a while instead of being
// retried on every call; the free tier also has a per-minute limit, so
// background calls are spaced out.
const coolUntil = new Map(); // `${keyIndex}:${model}` -> ms
const MIN_GAP_MS = 4200; // ~14 requests/minute
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pace() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  lastCall = Math.max(Date.now(), lastCall + MIN_GAP_MS);
  if (wait > 0) await sleep(wait);
}
const slots = () => {
  const keys = geminiKeys();
  const models = [...new Set([model(), fallbackModel()])];
  // Main model on every key first, then the fallback model on every key.
  return models.flatMap((m) => keys.map((k, i) => ({ key: k, i, m, id: `${i}:${m}` })));
};

/** True when every key/model is paused (quota) — callers can skip AI work early. */
export const geminiPaused = () => slots().every((s) => (coolUntil.get(s.id) || 0) > Date.now());
/** Reset cool-downs (after keys change in the admin). */
export const resetGemini = () => coolUntil.clear();

/**
 * Call Gemini and parse a strict JSON object from the response. Returns null on
 * any failure so callers can fall back to a safe default (e.g. needs_review).
 * Data minimisation is the caller's job (strip PII before calling).
 *
 * `background: true` (bulk jobs like Reddit scans) is paced and may wait out
 * per-minute limits; interactive calls (drafts, reply classification, forms)
 * skip the queue and never sleep on a 429 — they fall back instead.
 */
export async function generateJson(prompt, { background = false } = {}) {
  const all = slots();
  if (!all.length) {
    reportIssue('gemini', 'No API key set — add one in Settings → API keys.');
    return null;
  }
  let lastReason = '';
  for (const s of all) {
    if ((coolUntil.get(s.id) || 0) > Date.now()) continue;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (background) await pace();
      const r = await generateJsonWith(prompt, s);
      if (r.ok) {
        reportOk('gemini', `${geminiKeys().length} key(s) · last answer from ${s.m}${geminiKeys().length > 1 ? ` (key ${s.i + 1})` : ''}`);
        return r.value;
      }
      lastReason = r.reason || lastReason;
      if (r.status === 429 && (r.daily || s !== all[all.length - 1])) {
        // Daily quota (or another slot is available): pause this key+model.
        coolUntil.set(s.id, Date.now() + (r.daily ? 60 : 30) * 60 * 1000);
        break;
      }
      if (r.status === 429) {
        if (!background) break;
        await sleep(15000 * (attempt + 1)); // per-minute limit on the last slot
        continue;
      }
      if ([400, 401, 403].includes(r.status)) {
        coolUntil.set(s.id, Date.now() + 60 * 60 * 1000); // bad key: skip it
        break;
      }
      if (!r.fallback) {
        if (r.status) break;
        return r.value;
      }
      break;
    }
  }
  if (lastReason) reportIssue('gemini', lastReason);
  return null;
}

async function generateJsonWith(prompt, { key, m, i }) {
  try {
    // Free tier returns 500/503 under load; retry those with backoff.
    let res;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      res = await fetch(URL(m), {
        method: 'POST',
        // Key in a header, not the URL, so it never lands in proxy/error logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      });
      if (res.ok || ![500, 503].includes(res.status) || attempt === 3) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const daily = res.status === 429 && /PerDay|per day|daily/i.test(detail);
      logger.error({ status: res.status, model: m, key: i + 1, detail: detail.slice(0, 200) }, 'Gemini request failed');
      const reason = `${m}${geminiKeys().length > 1 ? ` (key ${i + 1})` : ''}: ${reasonFor(res.status, detail)}`;
      return { ok: false, value: null, status: res.status, daily, reason, fallback: [404, 429, 500, 503].includes(res.status) };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { ok: Boolean(text), value: text ? JSON.parse(text) : null };
  } catch (err) {
    logger.error({ err }, 'Gemini request/parse failed');
    return { ok: false, value: null, reason: `Could not reach Gemini: ${err.message}` };
  }
}
