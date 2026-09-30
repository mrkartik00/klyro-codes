import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Fixed model names get retired (gemini-2.0-flash is gone); the -latest alias
// follows Google's current Flash model. Override with GEMINI_MODEL.
const MODEL = env.GEMINI_MODEL || 'gemini-flash-latest';
// Free-tier quotas are per model: when the main model is out of quota (429)
// or retired (404), fall back to Flash-Lite, which has its own larger quota.
const FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
export const RETRY_DELAYS_MS = [1500, 4000, 9000];
const URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * Call Gemini and parse a strict JSON object from the response. Returns null on
 * any failure so callers can fall back to a safe default (e.g. needs_review).
 * Data minimisation is the caller's job (strip PII before calling).
 */
// A model that answered 429 (quota) is skipped for a while instead of being
// retried on every call; the free tier also has a per-minute limit, so calls
// are spaced out.
const coolUntil = new Map();
const MIN_GAP_MS = 4200; // ~14 requests/minute
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pace() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  lastCall = Math.max(Date.now(), lastCall + MIN_GAP_MS);
  if (wait > 0) await sleep(wait);
}

export async function generateJson(prompt, { model = MODEL } = {}) {
  const models = [...new Set([model, FALLBACK_MODEL])];
  for (const m of models) {
    if ((coolUntil.get(m) || 0) > Date.now()) continue;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await pace();
      const r = await generateJsonWith(prompt, m);
      if (r.ok) return r.value;
      if (r.status === 429) {
        // Out of daily quota on the main model: skip it for 30 min. On the
        // last model, it's usually the per-minute limit, so wait and retry.
        if (m !== models[models.length - 1]) {
          coolUntil.set(m, Date.now() + 30 * 60 * 1000);
          break;
        }
        await sleep(15000 * (attempt + 1));
        continue;
      }
      if (!r.fallback) return r.value;
      break;
    }
  }
  return null;
}

async function generateJsonWith(prompt, model) {
  if (!env.GEMINI_API_KEY) {
    logger.warn('GEMINI_API_KEY not set; drafting/classification disabled');
    return { ok: false, value: null };
  }
  try {
    // Free tier returns 429/503 under load; retry those with backoff.
    let res;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      res = await fetch(URL(model), {
        method: 'POST',
        // Key in a header, not the URL, so it never lands in proxy/error logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      });
      // 429 = out of quota for this model: switch model instead of waiting.
      if (res.ok || res.status === 429 || ![500, 503].includes(res.status) || attempt === 3) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error({ status: res.status, model, detail: detail.slice(0, 200) }, 'Gemini request failed');
      return { ok: false, value: null, status: res.status, fallback: [404, 429, 500, 503].includes(res.status) };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { ok: Boolean(text), value: text ? JSON.parse(text) : null };
  } catch (err) {
    logger.error({ err }, 'Gemini parse failed');
    return { ok: false, value: null };
  }
}
