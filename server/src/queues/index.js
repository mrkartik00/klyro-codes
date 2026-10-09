import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { resetDailyCounters, evaluateMailboxHealth } from '../services/mailboxHealth.service.js';
import { rollupDay } from '../services/analytics.service.js';
import { sendInvoiceReminders } from '../services/billing.service.js';
import { alertError } from '../services/alert.service.js';
import { sendTelegram } from '../integrations/telegram/index.js';
import { Workspace } from '../models/Workspace.js';
import { runDueSchedules } from '../services/schedule.service.js';
import { sendDigest } from '../services/digest.service.js';
import { autoEnrollWorkspace } from '../services/enrollment.service.js';

const connection = () => getRedis();
const registry = [];

/** Build queues + workers + repeatable schedules. Call once at boot (not in tests). */
export function startQueues() {
  const opts = { connection: connection() };

  const health = new Queue('mailboxHealth', opts);
  const daily = new Queue('dailyReset', opts);
  const rollup = new Queue('metricsRollup', opts);
  const reminders = new Queue('invoiceReminders', opts);
  const scheduler = new Queue('scrapeScheduler', opts);
  const digest = new Queue('morningDigest', opts);
  const autoEnroll = new Queue('autoEnroll', opts);
  registry.push(health, daily, rollup, reminders, scheduler, digest, autoEnroll);

  const mbWorker = new Worker(
    'mailboxHealth',
    async () => {
      const workspaces = await Workspace.find().lean();
      for (const ws of workspaces) {
        const { paused } = await evaluateMailboxHealth({ workspaceId: ws._id });
        // A10 — alert when a mailbox auto-pauses on high bounces.
        if (paused.length) {
          await sendTelegram(
            `⛔ <b>Mailbox auto-paused</b> (bounce rate > 3%)\n${paused.join('\n')}`,
          ).catch(() => {});
        }
      }
    },
    opts,
  );
  const dailyWorker = new Worker('dailyReset', async () => resetDailyCounters(), opts);
  const rollupWorker = new Worker(
    'metricsRollup',
    async () => {
      const workspaces = await Workspace.find().lean();
      for (const ws of workspaces) await rollupDay({ workspaceId: ws._id });
    },
    opts,
  );
  const remindersWorker = new Worker(
    'invoiceReminders',
    async () => {
      const workspaces = await Workspace.find().lean();
      for (const ws of workspaces) await sendInvoiceReminders({ workspaceId: ws._id });
    },
    opts,
  );

  // Scrape schedules (admin-defined cron jobs) — checked every minute.
  const schedulerWorker = new Worker('scrapeScheduler', async () => runDueSchedules(), opts);
  const digestWorker = new Worker(
    'morningDigest',
    async () => {
      for (const ws of await Workspace.find().lean()) await sendDigest({ workspaceId: ws._id, hours: 24 });
    },
    opts,
  );

  // Auto-enroll the best eligible leads into each workspace's active email
  // campaign so the outreach pipeline runs hands-off. Enrollment sends nothing
  // on its own — drafts still require approval before H3 sends them.
  const autoEnrollWorker = new Worker(
    'autoEnroll',
    async () => {
      for (const ws of await Workspace.find().lean()) {
        const r = await autoEnrollWorkspace({ workspaceId: ws._id, limit: 50 });
        if (r?.enrolled) logger.info({ workspaceId: String(ws._id), ...r }, 'auto-enroll run');
      }
    },
    opts,
  );

  // Surface worker failures to Telegram instead of failing silently.
  for (const [name, w] of [
    ['mailboxHealth', mbWorker],
    ['dailyReset', dailyWorker],
    ['metricsRollup', rollupWorker],
    ['invoiceReminders', remindersWorker],
    ['scrapeScheduler', schedulerWorker],
    ['morningDigest', digestWorker],
    ['autoEnroll', autoEnrollWorker],
  ]) {
    w.on('failed', (_job, err) => {
      logger.error({ err, worker: name }, 'BullMQ worker failed');
      alertError({ where: `queue:${name}`, message: err?.message ?? 'unknown' }).catch(() => {});
    });
    registry.push(w);
  }

  // Repeatable jobs.
  health.add('hourly', {}, { repeat: { pattern: '0 * * * *' }, removeOnComplete: true });
  daily.add('midnight', {}, { repeat: { pattern: '0 0 * * *' }, removeOnComplete: true });
  rollup.add('hourly', {}, { repeat: { pattern: '30 * * * *' }, removeOnComplete: true });
  reminders.add('daily', {}, { repeat: { pattern: '0 9 * * *' }, removeOnComplete: true });
  scheduler.add('minute', {}, { repeat: { pattern: '* * * * *' }, removeOnComplete: true, removeOnFail: 50 });
  // Morning digest of the best overnight leads (Telegram), 07:30 India time.
  digest.add('daily', {}, { repeat: { pattern: env.DIGEST_CRON || '30 7 * * *', tz: env.DIGEST_TZ || 'Asia/Kolkata' }, removeOnComplete: true });
  // Keep the active email campaign topped up with eligible leads, every 30 min.
  autoEnroll.add('tick', {}, { repeat: { pattern: '*/30 * * * *' }, removeOnComplete: true, removeOnFail: 50 });

  logger.info('BullMQ queues started (mailboxHealth, dailyReset, metricsRollup, invoiceReminders, scrapeScheduler, morningDigest, autoEnroll)');
}

export async function stopQueues() {
  await Promise.allSettled(registry.map((q) => q.close()));
}
