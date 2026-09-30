// Scrape schedules ("cron jobs"): run saved lead searches automatically.
//
// A BullMQ repeatable job ticks every minute (single execution across the
// cluster) and calls runDueSchedules(). Each due schedule is claimed atomically
// (its nextRunAt is advanced in the same update), so two API processes never
// fire the same run. The chosen searches then run one after another in the
// background: the Maps scraper and Reddit both work best one job at a time.
import { CronExpressionParser } from 'cron-parser';
import { logger } from '../config/logger.js';
import { ScrapeSchedule } from '../models/ScrapeSchedule.js';
import { ScrapeTarget, ScrapeJob } from '../models/ScrapeTarget.js';
import { sourceOf, sourceFilter, startTargetRun } from './sources.service.js';
import { writeAudit } from './audit.service.js';

const LIVE = ['queued', 'running', 'ingesting'];
const MIN = 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Cron expressions (5-field) equivalent to a frequency; [] for interval. */
export function cronExpressions(freq = {}) {
  const times = (freq.times?.length ? freq.times : ['09:00']).filter((t) => HHMM.test(t));
  const at = (dom, dow) => times.map((t) => `${Number(t.slice(3))} ${Number(t.slice(0, 2))} ${dom} * ${dow}`);
  switch (freq.type) {
    case 'interval':
      return [];
    case 'weekly':
      return at('*', (freq.days?.length ? freq.days : [1]).join(','));
    case 'monthly':
      return at(String(Math.min(Math.max(freq.dayOfMonth || 1, 1), 28)), '*');
    case 'cron':
      return [String(freq.cron || '').trim()];
    default:
      return at('*', '*');
  }
}

/** Throws a readable error if the frequency can't be scheduled. */
export function validateFrequency(freq, tz) {
  if (!isValidTimezone(tz)) throw new Error(`Unknown timezone "${tz}"`);
  if (freq.type === 'interval') {
    if (!(freq.everyMinutes >= 5 && freq.everyMinutes <= 10080)) throw new Error('Interval must be between 5 minutes and 7 days');
    return;
  }
  if (freq.type !== 'cron' && !(freq.times || []).some((t) => HHMM.test(t))) throw new Error('Add at least one time as HH:mm');
  if (freq.type === 'weekly' && !(freq.days || []).length) throw new Error('Pick at least one day');
  for (const expr of cronExpressions(freq)) {
    if (expr.split(/\s+/).length !== 5) throw new Error('Cron must have 5 fields: minute hour day month weekday');
    try {
      CronExpressionParser.parse(expr, { tz });
    } catch (err) {
      throw new Error(`Invalid cron "${expr}": ${err.message}`, { cause: err });
    }
  }
}

/** Next run strictly after `from`. */
export function nextRunTime(schedule, from = new Date()) {
  const freq = schedule.frequency || {};
  if (freq.type === 'interval') return new Date(from.getTime() + Math.max(5, freq.everyMinutes || 60) * MIN);
  const tz = schedule.timezone || 'UTC';
  let best = null;
  for (const expr of cronExpressions(freq)) {
    try {
      const d = CronExpressionParser.parse(expr, { currentDate: from, tz }).next().toDate();
      if (!best || d < best) best = d;
    } catch {
      /* invalid expressions are rejected on save */
    }
  }
  return best;
}

export function previewRuns(schedule, n = 5, from = new Date()) {
  const out = [];
  let t = from;
  for (let i = 0; i < n; i += 1) {
    t = nextRunTime(schedule, t);
    if (!t) break;
    out.push(t);
  }
  return out;
}

/** Searches this schedule would run next (oldest-run first). */
export async function resolveTargets(schedule, { all = false } = {}) {
  const base = { workspaceId: schedule.workspaceId, deletedAt: null, active: true };
  let filter;
  if (schedule.mode === 'pick') filter = { ...base, _id: { $in: schedule.targetIds || [] } };
  else {
    filter = { ...base };
    Object.assign(filter, sourceFilter(schedule.source));
    if (schedule.groups?.length) filter.group = { $in: schedule.groups };
  }
  const targets = await ScrapeTarget.find(filter).sort({ lastRunAt: 1, createdAt: 1 }).lean();
  // Missing lastRunAt sorts first in Mongo, so never-run searches go first.
  return all || !schedule.perRun ? targets : targets.slice(0, schedule.perRun);
}


async function sourceBusy(workspaceId, source) {
  const ids = await ScrapeTarget.find({ workspaceId, ...sourceFilter(source) }).distinct('_id');
  return ScrapeJob.exists({ workspaceId, scrapeTargetId: { $in: ids }, status: { $in: LIVE }, updatedAt: { $gt: new Date(Date.now() - 45 * MIN) } });
}

async function waitForJob(jobId, maxMs = 40 * MIN, heartbeat = async () => {}) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const j = await ScrapeJob.findById(jobId).select('status').lean();
    if (!j || !LIVE.includes(j.status)) return j?.status;
    await heartbeat();
    await sleep(20000);
  }
  return 'timeout';
}

/** Run one schedule now: its next N searches, one after another. */
export async function fireSchedule(schedule, { actorId, manual = false } = {}) {
  const workspaceId = schedule.workspaceId;
  const targets = await resolveTargets(schedule);
  const result = { startedAt: new Date(), manual, planned: targets.map((t) => t.name), started: [], skipped: [] };
  const beat = () => ScrapeSchedule.updateOne({ _id: schedule._id }, { $set: { heartbeatAt: new Date(), lastResult: result } });
  await beat();
  if (!targets.length) result.skipped.push({ name: '—', reason: 'No active searches match this schedule' });

  for (const t of targets) {
    try {
      const source = sourceOf(t);
      // One job per source at a time; wait (up to 40 min) for a running one.
      const until = Date.now() + 40 * MIN;
      while ((await sourceBusy(workspaceId, source)) && Date.now() < until) {
        await beat();
        await sleep(30000);
      }
      if (await sourceBusy(workspaceId, source)) {
        result.skipped.push({ name: t.name, reason: `another ${source} run is still going` });
        continue;
      }
      await ScrapeTarget.updateOne({ _id: t._id }, { $set: { lastRunAt: new Date() } });
      const args = { workspaceId, scrapeTargetId: t._id, createdBy: actorId, scheduleId: schedule._id, maxResults: schedule.maxResults || undefined };
      const job = await startTargetRun(t, args, { wait: true });
      result.started.push({ name: t.name, jobId: String(job._id) });
      await beat();
      if (source === 'maps') await waitForJob(job._id, 40 * MIN, beat);
    } catch (err) {
      logger.warn({ err, schedule: schedule.name, target: t.name }, 'scheduled search failed to start');
      result.skipped.push({ name: t.name, reason: String(err.message).slice(0, 200) });
    }
  }
  result.finishedAt = new Date();
  await ScrapeSchedule.updateOne({ _id: schedule._id }, { $set: { lastResult: result, heartbeatAt: null, lockedUntil: null } });
  await writeAudit({
    workspaceId,
    actorId,
    actorType: manual ? 'user' : 'system',
    action: 'schedule.run',
    entity: 'scrapeSchedule',
    entityId: schedule._id,
    meta: { started: result.started.length, skipped: result.skipped.length },
  }).catch(() => {});
  return result;
}

/** Called every minute: claim and fire every due schedule. */
export async function runDueSchedules(now = new Date()) {
  const due = await ScrapeSchedule.find({ enabled: true, deletedAt: null, nextRunAt: { $lte: now } }).limit(20).lean();
  let fired = 0;
  for (const s of due) {
    // Previous run still going (heartbeat in the last 5 min)? Skip this slot.
    const busy = s.heartbeatAt && now - new Date(s.heartbeatAt) < 5 * MIN;
    const claimed = await ScrapeSchedule.findOneAndUpdate(
      { _id: s._id, nextRunAt: s.nextRunAt, enabled: true },
      {
        $set: { nextRunAt: nextRunTime(s, now), ...(busy ? {} : { lastRunAt: now, lockedUntil: new Date(now.getTime() + 2 * MIN) }) },
        ...(busy ? {} : { $inc: { runCount: 1 } }),
      },
      { new: true },
    );
    if (!claimed || busy) continue;
    fired += 1;
    fireSchedule(claimed).catch((err) => logger.error({ err, schedule: s.name }, 'schedule run failed'));
  }
  return { due: due.length, fired };
}
