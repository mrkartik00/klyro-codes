// Morning digest: the best leads found overnight, sent to Telegram.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Lead } from '../models/Lead.js';
// Registered for populate() below (the digest may run in a bare worker process).
import '../models/Organization.js';
import '../models/Contact.js';
import { Approval } from '../models/Approval.js';
import { ScrapeJob } from '../models/ScrapeTarget.js';
import { WebsiteAudit } from '../models/WebsiteAudit.js';
import { sendTelegram } from '../integrations/telegram/index.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
const ISSUE = { 'no-website': 'no website', unreachable: 'site down', 'no-ssl': 'no HTTPS', 'no-viewport': 'not mobile-friendly', 'slow-mobile': 'slow', 'stale-copyright': 'outdated' };

/** Data for the digest (also used by the admin API). */
export async function digestData({ workspaceId: wsId, hours = 24, top = 10 }) {
  const workspaceId = new mongoose.Types.ObjectId(String(wsId));
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const base = { workspaceId, deletedAt: null, createdAt: { $gte: since } };
  const [reddit, maps, mapsCount, pending, jobs] = await Promise.all([
    Lead.find({ ...base, source: 'reddit' }).sort({ score: -1 }).limit(20).lean(),
    Lead.find({ ...base, source: { $ne: 'reddit' } })
      .sort({ score: -1, createdAt: -1 })
      .limit(top * 3)
      .populate('organizationId', 'name city category domain phone')
      .populate('primaryContactId', 'email emailStatus')
      .lean(),
    Lead.countDocuments({ ...base, source: { $ne: 'reddit' } }),
    Approval.countDocuments({ workspaceId, status: 'pending' }),
    ScrapeJob.aggregate([
      { $match: { workspaceId, createdAt: { $gte: since } } },
      { $group: { _id: '$status', n: { $sum: 1 }, leads: { $sum: '$ingested' } } },
    ]),
  ]);
  // Best Maps leads first: reachable (email or phone), then score.
  const reach = (l) => (l.primaryContactId?.email && l.primaryContactId.emailStatus !== 'invalid' ? 2 : l.organizationId?.phone ? 1 : 0);
  const best = maps.sort((a, b) => reach(b) - reach(a) || (b.score ?? 0) - (a.score ?? 0)).slice(0, top);
  const audits = await WebsiteAudit.find({ workspaceId, organizationId: { $in: best.map((l) => l.organizationId?._id).filter(Boolean) } })
    .sort({ createdAt: -1 })
    .lean();
  const issuesByOrg = {};
  for (const a of audits) issuesByOrg[String(a.organizationId)] ??= a.issues || [];
  return { since, reddit, best, mapsCount, pending, jobs, issuesByOrg };
}

export async function buildDigest({ workspaceId, hours = 24 }) {
  const d = await digestData({ workspaceId, hours });
  const admin = env.ADMIN_ORIGIN.replace(/\/$/, '');
  const runs = d.jobs.reduce((s, j) => s + j.n, 0);
  const failed = d.jobs.find((j) => j._id === 'failed')?.n ?? 0;
  const lines = [`🌅 <b>Klyro — leads from the last ${hours}h</b>`, `${d.reddit.length} Reddit buyers · ${d.mapsCount} Maps leads · ${runs} searches run${failed ? ` (${failed} failed)` : ''}`, ''];

  if (d.reddit.length) {
    lines.push('<b>🔥 Reddit — people hiring</b>');
    for (const l of d.reddit.slice(0, 10)) {
      lines.push(
        `• <b>${Math.round((l.intent?.score ?? 0) * 100)}%</b> ${esc(cut(l.intent?.title, 90))}\n  ${esc(cut(l.intent?.need, 90))} · ${esc(l.intent?.community)}\n  <a href="${esc(l.sourceUrl)}">post</a> · <a href="${admin}/leads/${l._id}">lead</a>`,
      );
    }
    lines.push('');
  }
  if (d.best.length) {
    lines.push('<b>🏪 Best new businesses</b>');
    for (const l of d.best) {
      const o = l.organizationId || {};
      const c = l.primaryContactId || {};
      const issues = (d.issuesByOrg[String(o._id)] || []).map((i) => ISSUE[i]).filter(Boolean).slice(0, 3);
      const contact = c.email ? '✉️' : o.phone ? '📞' : '';
      lines.push(`• <b>${l.score ?? 0}</b> ${contact} <a href="${admin}/leads/${l._id}">${esc(cut(o.name, 50))}</a> — ${esc(o.category || '')}${o.city ? `, ${esc(o.city)}` : ''}${issues.length ? `\n  ${esc(issues.join(' · '))}` : ''}`);
    }
    lines.push('');
  }
  if (!d.reddit.length && !d.best.length) lines.push('No new leads yet — check that schedules are enabled.', '');
  lines.push(`📝 ${d.pending} draft${d.pending === 1 ? '' : 's'} waiting in Approvals`);
  lines.push(`<a href="${admin}/leads?since=${hours}">Open new leads</a> · <a href="${admin}/approvals">Approvals</a>`);
  // Telegram messages max out at 4096 chars.
  return lines.join('\n').slice(0, 4000);
}

export async function sendDigest({ workspaceId, hours = 24 }) {
  const text = await buildDigest({ workspaceId, hours });
  return sendTelegram(text);
}
