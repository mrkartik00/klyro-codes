// Settings → API keys: view (masked), replace, remove and test every
// integration key, with its last known status and the reason for any failure.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { encrypt } from '../utils/crypto.js';
import { Setting } from '../models/Setting.js';
import { writeAudit } from '../services/audit.service.js';
import { INTEGRATIONS, KEY_META, SECRET_PREFIX, cfg, cfgNum, overrideSource, loadSecrets } from '../config/secrets.js';
import { readStatuses, reportOk, reportIssue, reasonFor } from '../services/integrationStatus.service.js';
import { generateJson, geminiKeys, resetGemini } from '../integrations/gemini/index.js';
import { sendTelegram } from '../integrations/telegram/index.js';
import { braveKeys, braveUsage, usage } from '../services/intent.service.js';

export const keysRouter = Router();

const mask = (v) => {
  const s = String(v ?? '');
  if (!s) return '';
  return s
    .split(',')
    .map((p) => p.trim())
    .map((p) => (p.length <= 8 ? '••••' : `${p.slice(0, 3)}••••${p.slice(-4)}`))
    .join(', ');
};

keysRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const statuses = await readStatuses();
    const extra = {
      brave: await braveUsage(req.workspaceId).catch(() => null),
      x: { used: await usage(req.workspaceId, 'x').catch(() => 0), cap: cfgNum('X_MONTHLY_READ_CAP', 3000) },
    };
    const rows = await Setting.find({ workspaceId: req.workspaceId, key: { $regex: `^${SECRET_PREFIX}` } })
      .select('key updatedAt')
      .lean();
    const updated = Object.fromEntries(rows.map((r) => [r.key.slice(SECRET_PREFIX.length), r.updatedAt]));
    return ok(
      res,
      INTEGRATIONS.map((i) => {
        const keys = i.keys.map((k) => {
          const value = cfg(k.name);
          return {
            name: k.name,
            label: k.label,
            hint: k.hint,
            secret: Boolean(k.secret),
            set: Boolean(value),
            source: overrideSource(k.name), // admin | env | null
            preview: k.secret ? mask(value) : String(value ?? ''),
            count: k.secret && value ? String(value).split(',').filter((x) => x.trim()).length : undefined,
            updatedAt: updated[k.name],
          };
        });
        const required = i.keys.filter((k) => k.secret || ['BSKY_HANDLE', 'TELEGRAM_CHAT_ID', 'RAZORPAY_KEY_ID', 'REDDIT_CLIENT_ID'].includes(k.name));
        const configured = required.every((k) => cfg(k.name));
        return { id: i.id, name: i.name, use: i.use, url: i.url, configured, keys, status: statuses[i.id] || null, usage: extra[i.id] };
      }),
    );
  }),
);

keysRouter.put(
  '/:name',
  validateBody(z.object({ value: z.string().trim().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    const meta = KEY_META[req.params.name];
    if (!meta) throw ApiError.notFound('Unknown key');
    const value = req.body.value.replace(/\s*,\s*/g, ',');
    await Setting.findOneAndUpdate(
      { workspaceId: req.workspaceId, key: `${SECRET_PREFIX}${req.params.name}` },
      { $set: { value: meta.secret ? encrypt(value) : value, encrypted: Boolean(meta.secret), createdBy: req.auth.userId } },
      { upsert: true },
    );
    await loadSecrets();
    if (meta.integration === 'gemini') resetGemini();
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'apikey.update', entity: 'setting', meta: { key: req.params.name } });
    return ok(res, { saved: true });
  }),
);

// Remove the admin value → falls back to the server .env value (if any).
keysRouter.delete(
  '/:name',
  asyncHandler(async (req, res) => {
    if (!KEY_META[req.params.name]) throw ApiError.notFound('Unknown key');
    await Setting.deleteOne({ workspaceId: req.workspaceId, key: `${SECRET_PREFIX}${req.params.name}` });
    await loadSecrets();
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'apikey.remove', entity: 'setting', meta: { key: req.params.name } });
    return ok(res, { removed: true, fallback: overrideSource(req.params.name) });
  }),
);

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }).catch((e) => ({ ok: false, status: e.name, text: async () => e.message }));
  const body = res.ok ? '' : await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, body, json: res.ok ? await res.json().catch(() => ({})) : null };
}

const TESTS = {
  async gemini() {
    const n = geminiKeys().length;
    if (!n) throw new Error('No API key set.');
    const r = await generateJson('Return JSON {"ok": true}');
    if (!r?.ok) throw new Error('No answer — see the reason above (quota, invalid key or model).');
    return `Answered (${n} key${n > 1 ? 's' : ''}).`;
  },
  async brave(req) {
    const keys = braveKeys();
    if (!keys.length) throw new Error('No API key set.');
    const out = [];
    for (let i = 0; i < keys.length; i += 1) {
      const r = await call('https://api.search.brave.com/res/v1/web/search?q=klyro&count=1', { headers: { 'x-subscription-token': keys[i], accept: 'application/json' } });
      await usage(req.workspaceId, `brave${i}`, 1);
      out.push(`key ${i + 1}: ${r.ok ? 'ok' : reasonFor(r.status, r.body)}`);
      await new Promise((x) => setTimeout(x, 1100));
    }
    if (out.some((x) => !x.endsWith('ok'))) throw new Error(out.join(' · '));
    return out.join(' · ');
  },
  async bluesky() {
    const r = await call('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: cfg('BSKY_HANDLE'), password: cfg('BSKY_APP_PASSWORD') }),
    });
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    return `Logged in as ${r.json.handle}.`;
  },
  async companieshouse() {
    const r = await call('https://api.company-information.service.gov.uk/search/companies?q=klyro&items_per_page=1', {
      headers: { authorization: `Basic ${Buffer.from(`${cfg('COMPANIES_HOUSE_API_KEY')}:`).toString('base64')}` },
    });
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    return 'Key accepted.';
  },
  async x() {
    // Usage endpoint: validates the token without paying for post reads.
    const r = await call('https://api.x.com/2/usage/tweets', { headers: { authorization: `Bearer ${cfg('X_BEARER_TOKEN')}` } });
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    return `Token accepted${r.json?.data?.project_usage != null ? ` · project usage ${r.json.data.project_usage}` : ''}.`;
  },
  async sam() {
    const d = new Date();
    const f = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    const r = await call(`https://api.sam.gov/opportunities/v2/search?api_key=${encodeURIComponent(cfg('SAM_API_KEY'))}&postedFrom=${f}&postedTo=${f}&limit=1`);
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    return 'Key accepted.';
  },
  async reddit() {
    const r = await call('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg('REDDIT_CLIENT_ID')}:${cfg('REDDIT_CLIENT_SECRET')}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'klyro-lead-finder/1.0',
      },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    return 'Credentials accepted.';
  },
  async telegram() {
    const r = await sendTelegram('✅ Test from Klyro admin: Telegram alerts work.');
    if (r?.skipped) throw new Error('Bot token or chat ID missing.');
    if (r?.ok === false) throw new Error(r.description || 'Telegram rejected the message.');
    return 'Test message sent — check Telegram.';
  },
  async brevo() {
    const r = await call('https://api.brevo.com/v3/account', { headers: { 'api-key': cfg('BREVO_API_KEY'), accept: 'application/json' } });
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    const credits = (r.json.plan || []).map((p) => `${p.credits ?? '∞'} ${p.creditsType || ''}`.trim()).join(', ');
    return `Account ${r.json.email}${credits ? ` · credits: ${credits}` : ''}.`;
  },
  async razorpay() {
    const r = await call('https://api.razorpay.com/v1/payments?count=1', {
      headers: { authorization: `Basic ${Buffer.from(`${cfg('RAZORPAY_KEY_ID')}:${cfg('RAZORPAY_KEY_SECRET')}`).toString('base64')}` },
    });
    if (!r.ok) throw new Error(reasonFor(r.status, r.body));
    return 'Keys accepted.';
  },
};

keysRouter.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const t = TESTS[req.params.id];
    if (!t) throw ApiError.badRequest('This integration has no test');
    try {
      const message = await t(req);
      reportOk(req.params.id, message);
      return ok(res, { ok: true, message });
    } catch (err) {
      reportIssue(req.params.id, err.message);
      return ok(res, { ok: false, message: err.message });
    }
  }),
);
