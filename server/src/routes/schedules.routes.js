// Admin CRUD for scrape schedules ("cron jobs").
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { writeAudit } from '../services/audit.service.js';
import { ScrapeSchedule } from '../models/ScrapeSchedule.js';
import { ScrapeJob } from '../models/ScrapeTarget.js';
import { validateFrequency, nextRunTime, previewRuns, resolveTargets, fireSchedule } from '../services/schedule.service.js';

export const schedulesRouter = Router();

const frequency = z.object({
  type: z.enum(['interval', 'daily', 'weekly', 'monthly', 'cron']),
  everyMinutes: z.number().int().min(5).max(10080).optional(),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm')).max(12).optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  cron: z.string().trim().max(100).optional(),
});
const fields = {
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  frequency,
  timezone: z.string().trim().min(1).max(64),
  mode: z.enum(['group', 'pick']),
  source: z.enum(['maps', 'reddit', 'any']),
  groups: z.array(z.string().trim().max(60)).max(50),
  targetIds: z.array(z.string()).max(500),
  perRun: z.number().int().min(0).max(100),
  maxResults: z.number().int().min(1).max(1000).nullable(),
};
const createSchema = z.object({
  ...fields,
  enabled: fields.enabled.default(true),
  timezone: fields.timezone.default('Asia/Kolkata'),
  mode: fields.mode.default('group'),
  source: fields.source.default('any'),
  groups: fields.groups.default([]),
  targetIds: fields.targetIds.default([]),
  perRun: fields.perRun.default(1),
  maxResults: fields.maxResults.optional(),
});
const updateSchema = z.object(fields).partial();

const check = (s) => {
  try {
    validateFrequency(s.frequency || {}, s.timezone || 'UTC');
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
  if (s.mode === 'pick' && !(s.targetIds || []).length) throw ApiError.badRequest('Pick at least one search');
};

async function withStats(workspaceId, docs) {
  const ids = docs.map((d) => d._id);
  const stats = await ScrapeJob.aggregate([
    { $match: { workspaceId, scheduleId: { $in: ids } } },
    { $group: { _id: '$scheduleId', runs: { $sum: 1 }, leads: { $sum: '$ingested' }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
  ]);
  const by = Object.fromEntries(stats.map((x) => [String(x._id), x]));
  return docs.map((d) => ({ ...d, stats: by[String(d._id)] || { runs: 0, leads: 0, failed: 0 } }));
}

schedulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await ScrapeSchedule.find({ workspaceId: req.workspaceId, deletedAt: null }).sort({ enabled: -1, nextRunAt: 1 }).lean();
    return ok(res, await withStats(req.workspaceId, docs));
  }),
);

// Preview: next run times + which searches would run, for an unsaved form.
schedulesRouter.post(
  '/preview',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const s = { workspaceId: req.workspaceId, timezone: 'Asia/Kolkata', mode: 'group', source: 'any', groups: [], perRun: 1, ...req.body };
    try {
      validateFrequency(s.frequency || { type: 'daily', times: ['09:00'] }, s.timezone);
    } catch (err) {
      return ok(res, { error: err.message, runs: [], next: [], matching: 0 });
    }
    const all = await resolveTargets(s, { all: true });
    const next = s.perRun ? all.slice(0, s.perRun) : all;
    return ok(res, { runs: previewRuns(s, 5), next: next.map((t) => t.name), matching: all.length });
  }),
);

schedulesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const s = await ScrapeSchedule.findOne({ workspaceId: req.workspaceId, _id: req.params.id, deletedAt: null }).lean();
    if (!s) throw ApiError.notFound('Schedule not found');
    const jobs = await ScrapeJob.find({ workspaceId: req.workspaceId, scheduleId: s._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('scrapeTargetId', 'name source')
      .lean();
    const all = await resolveTargets(s, { all: true });
    const [withS] = await withStats(req.workspaceId, [s]);
    return ok(res, { schedule: withS, jobs, upcoming: previewRuns(s, 5), queue: all.map((t) => ({ name: t.name, lastRunAt: t.lastRunAt })) });
  }),
);

schedulesRouter.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    check(req.body);
    const s = new ScrapeSchedule({ workspaceId: req.workspaceId, createdBy: req.auth.userId, ...req.body });
    s.nextRunAt = nextRunTime(s);
    await s.save();
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'schedule.create', entity: 'scrapeSchedule', entityId: s._id, meta: req.body });
    return created(res, s);
  }),
);

schedulesRouter.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const s = await ScrapeSchedule.findOne({ workspaceId: req.workspaceId, _id: req.params.id, deletedAt: null });
    if (!s) throw ApiError.notFound('Schedule not found');
    const { frequency: f, ...rest } = req.body;
    Object.assign(s, rest);
    if (f) s.frequency = { ...(s.frequency?.toObject?.() ?? {}), ...f };
    check(s.toObject());
    // Timing changed or re-enabled: recompute the next run from now.
    if (f || req.body.timezone || req.body.enabled === true) s.nextRunAt = nextRunTime(s);
    await s.save();
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'schedule.update', entity: 'scrapeSchedule', entityId: s._id, meta: req.body });
    return ok(res, s);
  }),
);

schedulesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await ScrapeSchedule.updateOne({ workspaceId: req.workspaceId, _id: req.params.id, deletedAt: null }, { $set: { deletedAt: new Date(), enabled: false } });
    if (!r.matchedCount) throw ApiError.notFound('Schedule not found');
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'schedule.delete', entity: 'scrapeSchedule', entityId: req.params.id });
    return ok(res, { deleted: true });
  }),
);

// Run now (in the background); doesn't change the regular timetable.
schedulesRouter.post(
  '/:id/run',
  asyncHandler(async (req, res) => {
    const s = await ScrapeSchedule.findOne({ workspaceId: req.workspaceId, _id: req.params.id, deletedAt: null });
    if (!s) throw ApiError.notFound('Schedule not found');
    if (s.heartbeatAt && Date.now() - s.heartbeatAt.getTime() < 5 * 60 * 1000) throw ApiError.conflict('This schedule is already running');
    await ScrapeSchedule.updateOne({ _id: s._id }, { $set: { lastRunAt: new Date(), heartbeatAt: new Date() }, $inc: { runCount: 1 } });
    fireSchedule(s, { actorId: req.auth.userId, manual: true }).catch(() => {});
    return ok(res, { started: true });
  }),
);
