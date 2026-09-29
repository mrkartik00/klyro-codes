import { env } from '../../config/env.js';
import { sign } from '../../utils/hmac.js';
import { logger } from '../../config/logger.js';

// n8n integration. Two directions:
//  - outbound webhook to trigger a workflow (HMAC-signed, same scheme as /internal)
//  - REST API client for the admin automation panel (list/activate/run workflows)

/** Fire a signed webhook to n8n to start a workflow (e.g. scrape.start). */
export async function triggerWorkflow(path, body) {
  if (!env.N8N_WEBHOOK_URL) {
    logger.warn('N8N_WEBHOOK_URL not set; skipping workflow trigger');
    return { skipped: true };
  }
  const payload = JSON.stringify(body ?? {});
  const timestamp = String(Date.now());
  // Same scheme as /internal: HMAC-SHA256 over `${timestamp}.${body}`.
  const signature = sign(timestamp, payload);
  const url = `${env.N8N_WEBHOOK_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-klyro-timestamp': timestamp,
        'x-klyro-signature': signature,
      },
      body: payload,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    logger.error({ err }, 'n8n webhook failed');
    return { ok: false, error: err.message };
  }
}

// ---- REST API (automation panel) ----
function apiHeaders() {
  if (!env.N8N_API_URL || !env.N8N_API_KEY) return null;
  return { 'X-N8N-API-KEY': env.N8N_API_KEY, 'content-type': 'application/json' };
}

async function api(path, options = {}) {
  const headers = apiHeaders();
  if (!headers) return { unavailable: true };
  const res = await fetch(`${env.N8N_API_URL.replace(/\/$/, '')}/api/v1${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`n8n API ${path} failed: ${res.status}`);
  return res.json();
}

export async function listWorkflows() {
  const data = await api('/workflows');
  if (data?.unavailable) return [];
  return (data.data ?? data ?? []).map((w) => ({ id: w.id, name: w.name, active: w.active }));
}

export async function setWorkflowActive(id, active) {
  return api(`/workflows/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' });
}

export async function listExecutions(workflowId) {
  const q = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}&limit=20` : '?limit=20';
  const data = await api(`/executions${q}`);
  if (data?.unavailable) return [];
  return data.data ?? data ?? [];
}
