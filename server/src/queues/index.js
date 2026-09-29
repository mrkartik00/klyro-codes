import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { resetDailyCounters, evaluateMailboxHealth } from '../services/mailboxHealth.service.js';
import { rollupDay } from '../services/analytics.service.js';
import { sendInvoiceReminders } from '../services/billing.service.js';
import { alertError } from '../services/alert.service.js';
import { sendTelegram } from '../integrations/telegram/index.js';
import { Workspace } from '../models/Workspace.js';

const connection = () => getRedis();
const registry = [];

/** Build queues + workers + repeatable schedules. Call once at boot (not in tests). */
export function startQueues() {
  const opts = { connection: connection() };

  const health = new Queue('mailboxHealth', opts);
  const daily = new Queue('dailyReset', opts);
  const rollup = new Queue('metricsRollup', opts);
  const reminders = new Queue('invoiceReminders', opts);
  registry.push(health, daily, rollup, reminders);

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

  // Surface worker failures to Telegram instead of failing silently.
  for (const [name, w] of [
    ['mailboxHealth', mbWorker],
    ['dailyReset', dailyWorker],
    ['metricsRollup', rollupWorker],
    ['invoiceReminders', remindersWorker],
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

  logger.info('BullMQ queues started (mailboxHealth, dailyReset, metricsRollup, invoiceReminders)');
}

export async function stopQueues() {
  await Promise.allSettled(registry.map((q) => q.close()));
}
