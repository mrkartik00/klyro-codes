import { sendTelegram } from '../integrations/telegram/index.js';

/** Best-effort alerts. Call AFTER a transaction commits, never inside one. */
export async function alertPositiveReply({ leadTitle, dealId, snippet }) {
  return sendTelegram(
    `💬 <b>Positive reply</b>\n${leadTitle}\n<i>${(snippet ?? '').slice(0, 200)}</i>`,
    { buttons: [{ text: 'Open deal', data: `deal:${dealId}` }] },
  );
}

export async function alertPitchVisit({ leadTitle }) {
  return sendTelegram(`👀 <b>Pitch viewed</b>\n${leadTitle} is looking at your pitch page`);
}

export async function alertApprovalNeeded({ count }) {
  return sendTelegram(`📝 ${count} draft(s) awaiting approval`);
}

export async function alertError({ where, message }) {
  return sendTelegram(`⚠️ <b>Error</b> in ${where}\n${message}`);
}
