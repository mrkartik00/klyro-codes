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
  const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return sendTelegram(`⚠️ <b>Error</b> in ${esc(where)}\n${esc(message).slice(0, 3500)}`);
}
