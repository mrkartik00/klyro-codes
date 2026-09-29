import { Mailbox } from '../models/Mailbox.js';
import { Message } from '../models/Message.js';
import { MAILBOX_LIMITS, WARMUP_RAMP } from '../config/constants.js';

/**
 * Recompute each mailbox's rolling 7-day bounce/complaint rates and auto-pause
 * any that breach the thresholds. Returns the list of newly paused mailboxes
 * (so the caller can alert). Run hourly by a BullMQ job.
 */
export async function evaluateMailboxHealth({ workspaceId }) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const mailboxes = await Mailbox.find({ workspaceId, status: { $ne: 'paused' } });
  const paused = [];
  for (const mb of mailboxes) {
    const sent = await Message.countDocuments({
      workspaceId,
      mailboxId: mb._id,
      direction: 'outbound',
      sentAt: { $gte: since },
    });
    if (sent < 20) continue; // not enough volume to judge
    const bounced = await Message.countDocuments({
      workspaceId,
      mailboxId: mb._id,
      status: 'bounced',
      sentAt: { $gte: since },
    });
    mb.bounceRate = bounced / sent;
    if (mb.bounceRate > MAILBOX_LIMITS.maxBounceRate) {
      mb.status = 'paused';
      paused.push(mb.address);
    }
    await mb.save();
  }
  return { evaluated: mailboxes.length, paused };
}

/** Daily cap for a mailbox based on days since warmup start. */
export function warmupCap(warmupStartedAt, now = new Date()) {
  if (!warmupStartedAt) return WARMUP_RAMP[0];
  const day = Math.floor((now - new Date(warmupStartedAt)) / (24 * 60 * 60 * 1000));
  return WARMUP_RAMP[Math.min(day, WARMUP_RAMP.length - 1)];
}

/** Reset sentToday for all mailboxes (run at midnight UTC). */
export async function resetDailyCounters() {
  await Mailbox.updateMany({}, { $set: { sentToday: 0 } });
}
