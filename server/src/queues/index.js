import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { resetDailyCounters, evaluateMailboxHealth } from '../services/mailboxHealth.service.js';
import { rollupDay } from '../services/analytics.service.js';
import { Workspace } from '../models/Workspace.js';

const connection = () => getRedis();
const registry = [];

/** Build queues + workers + repeatable schedules. Call once at boot (not in tests). */
export function startQueues() {
  const opts = { connection: connection() };

  const health = new Queue('mailboxHealth', opts);
  const daily = new Queue('dailyReset', opts);
  const rollup = new Queue('metricsRollup', opts);
  registry.push(health, daily, rollup);

  new Worker(
    'mailboxHealth',
    async () => {
      const workspaces = await Workspace.find().lean();
      for (const ws of workspaces) await evaluateMailboxHealth({ workspaceId: ws._id });
    },
    opts,
  );
  new Worker('dailyReset', async () => resetDailyCounters(), opts);
  new Worker(
    'metricsRollup',
    async () => {
      const workspaces = await Workspace.find().lean();
      for (const ws of workspaces) await rollupDay({ workspaceId: ws._id });
    },
    opts,
  );

  // Repeatable jobs.
  health.add('hourly', {}, { repeat: { pattern: '0 * * * *' }, removeOnComplete: true });
  daily.add('midnight', {}, { repeat: { pattern: '0 0 * * *' }, removeOnComplete: true });
  rollup.add('hourly', {}, { repeat: { pattern: '30 * * * *' }, removeOnComplete: true });

  logger.info('BullMQ queues started (mailboxHealth, dailyReset, metricsRollup)');
}

export async function stopQueues() {
  await Promise.allSettled(registry.map((q) => q.close()));
}
