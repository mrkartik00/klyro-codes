import { cfg } from '../../config/secrets.js';
import { reportOk, reportIssue, reasonFor } from '../../services/integrationStatus.service.js';
import { logger } from '../../config/logger.js';

/**
 * Send a Telegram message. Optional inline keyboard for Approve/Reject.
 * No-ops (warns) when unconfigured so alert paths never crash a transaction's
 * caller (alerts are always best-effort, fired after commit).
 */
export async function sendTelegram(text, { buttons, chatId = cfg('TELEGRAM_CHAT_ID') } = {}) {
  if (!cfg('TELEGRAM_BOT_TOKEN') || !chatId) {
    logger.warn('Telegram not configured; skipping alert');
    return { skipped: true };
  }
  const reply_markup = buttons
    ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))] }
    : undefined;
  const res = await fetch(`https://api.telegram.org/bot${cfg('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error({ status: res.status }, 'Telegram send failed');
    reportIssue('telegram', res.status === 400 && /chat not found/i.test(body.description || '') ? 'Chat not found — check the Chat ID (message the bot first).' : reasonFor(res.status, body.description));
  } else reportOk('telegram', `Last message to chat ${chatId}`);
  return body;
}

/** Answer an inline-button callback so the loading spinner clears in Telegram. */
export async function answerCallback(callbackQueryId, text) {
  if (!cfg('TELEGRAM_BOT_TOKEN')) return { skipped: true };
  const res = await fetch(`https://api.telegram.org/bot${cfg('TELEGRAM_BOT_TOKEN')}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
  return res.json().catch(() => ({}));
}
