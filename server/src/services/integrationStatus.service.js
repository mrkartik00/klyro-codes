// Last known health of each integration, with a human reason, shown in
// Settings → API keys. Writes only when the state changes or every 10 min.
import { logger } from '../config/logger.js';

const KEY = (id) => `status:${id}`;
const mem = {}; // id -> { ok, reason, at, savedAt }

async function persist(id, s) {
  try {
    const { Setting } = await import('../models/Setting.js');
    const { Workspace } = await import('../models/Workspace.js');
    const ws = await Workspace.findOne().sort({ createdAt: 1 }).select('_id').lean();
    if (!ws) return;
    await Setting.updateOne({ workspaceId: ws._id, key: KEY(id) }, { $set: { value: { ok: s.ok, reason: s.reason, at: s.at, detail: s.detail } } }, { upsert: true });
  } catch (err) {
    logger.warn({ err, id }, 'integration status save failed');
  }
}

function record(id, ok, reason = '', detail) {
  const prev = mem[id];
  const now = Date.now();
  const s = { ok, reason, detail, at: new Date(), savedAt: prev?.savedAt || 0 };
  mem[id] = s;
  if (!prev || prev.ok !== ok || prev.reason !== reason || now - prev.savedAt > 10 * 60 * 1000) {
    s.savedAt = now;
    persist(id, s);
  }
}

export const reportOk = (id, detail) => record(id, true, '', detail);
export const reportIssue = (id, reason, detail) => {
  logger.warn({ integration: id, reason }, 'integration issue');
  record(id, false, String(reason).slice(0, 300), detail);
};

/** Human reason for an HTTP failure from an API. */
export function reasonFor(status, body = '') {
  const b = String(body);
  if (status === 401 || /invalid.*(key|token)|unauthori[sz]ed|API_KEY_INVALID|Invalid identifier or password/i.test(b)) return 'Key rejected — expired, revoked or mistyped. Paste a new one.';
  if (status === 403) return /permission|forbidden/i.test(b) ? 'Key has no permission for this API (check the plan / app settings).' : 'Access forbidden (403).';
  if (status === 402) return 'Out of credit / payment required — top up or add another key.';
  if (status === 429) return /PerDay|per day|daily|quota/i.test(b) ? 'Daily free quota used up — resets in a few hours (or add another key).' : 'Rate limited — too many requests; it retries automatically.';
  if (status >= 500) return `The provider is having problems (${status}) — usually temporary.`;
  if (status === 'TimeoutError' || status === 'AbortError') return 'Timed out — provider slow or unreachable.';
  return `Request failed (${status})`;
}

export async function readStatuses() {
  const { Setting } = await import('../models/Setting.js');
  const rows = await Setting.find({ key: { $regex: '^status:' } }).lean();
  const out = {};
  for (const r of rows) out[r.key.slice(7)] = r.value;
  for (const [id, s] of Object.entries(mem)) if (!out[id] || new Date(out[id].at) < s.at) out[id] = { ok: s.ok, reason: s.reason, at: s.at, detail: s.detail };
  return out;
}
