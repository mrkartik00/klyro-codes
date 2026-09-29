import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const MODEL = 'gemini-2.0-flash';
const URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

/**
 * Call Gemini and parse a strict JSON object from the response. Returns null on
 * any failure so callers can fall back to a safe default (e.g. needs_review).
 * Data minimisation is the caller's job (strip PII before calling).
 */
export async function generateJson(prompt, { model = MODEL } = {}) {
  if (!env.GEMINI_API_KEY) {
    logger.warn('GEMINI_API_KEY not set; drafting/classification disabled');
    return null;
  }
  try {
    const res = await fetch(URL(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, 'Gemini request failed');
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? JSON.parse(text) : null;
  } catch (err) {
    logger.error({ err }, 'Gemini parse failed');
    return null;
  }
}
