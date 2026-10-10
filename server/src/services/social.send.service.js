// Social send runner — drains the approved LinkedIn (and later IG/WhatsApp)
// queue through Unipile, one send per eligible account per tick. The 5-minute
// spacing and daily cap are enforced inside claimSocialSend (atomic reserve on
// SocialAccount), so this runner can safely process up to a small batch per
// tick. Sending is gated by env.LINKEDIN_SENDING_ENABLED — when false, nothing
// is sent (drafts still queue and show in Approvals).
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Workspace } from '../models/Workspace.js';
import { Contact } from '../models/Contact.js';
import { readySends, claimSocialSend, recordSendResult } from './send.service.js';
import { pullProfile, sendMessage, unipileConfigured } from '../integrations/unipile/index.js';

const CHANNEL = 'linkedin';

/** Process one workspace's ready LinkedIn sends (bounded). Returns a summary. */
export async function runLinkedInSends({ workspaceId, limit = 3 }) {
  if (!env.LINKEDIN_SENDING_ENABLED) return { skipped: 'disabled' };
  if (!unipileConfigured()) return { skipped: 'unipile_not_configured' };

  const ready = await readySends({ workspaceId, limit, channel: CHANNEL });
  let sent = 0;
  let blocked = 0;
  let failed = 0;

  for (const r of ready) {
    const claim = await claimSocialSend({ workspaceId, enrollmentId: r.enrollmentId, stepOrder: r.stepOrder, channel: CHANNEL });
    if (!claim.claimed) {
      blocked++;
      continue;
    }
    if (claim.idempotent) continue;

    try {
      // Resolve the recipient's Unipile provider id (cache it on the contact).
      let providerId = claim.providerId;
      if (!providerId) {
        const prof = await pullProfile({
          channel: CHANNEL,
          profileUrl: claim.profileUrl,
          pullAccountId: claim.pullAccountId,
          accountId: claim.accountId,
        });
        providerId = prof.providerId;
        if (providerId) {
          await Contact.updateOne({ workspaceId, _id: r.contactId ?? undefined, linkedinUrl: claim.profileUrl }, { $set: { linkedinProviderId: providerId } }).catch(() => {});
        }
      }
      if (!providerId) throw new Error('could not resolve LinkedIn provider id');

      const res = await sendMessage({ accountId: claim.accountId, to: providerId, text: claim.body });
      await recordSendResult({ workspaceId, messageId: claim.messageId, ok: true, providerMessageId: res.providerMessageId, threadId: res.threadId });
      sent++;
    } catch (err) {
      await recordSendResult({ workspaceId, messageId: claim.messageId, ok: false, error: String(err?.message ?? err).slice(0, 500) }).catch(() => {});
      failed++;
      logger.warn({ err, enrollmentId: r.enrollmentId }, 'linkedin send failed');
    }
  }

  return { ready: ready.length, sent, blocked, failed };
}

/** Run LinkedIn sends across all workspaces (worker entry). */
export async function runAllLinkedInSends() {
  if (!env.LINKEDIN_SENDING_ENABLED) return;
  for (const ws of await Workspace.find().lean()) {
    const r = await runLinkedInSends({ workspaceId: ws._id, limit: 3 });
    if (r?.sent || r?.failed) logger.info({ workspaceId: String(ws._id), ...r }, 'linkedin send run');
  }
}
