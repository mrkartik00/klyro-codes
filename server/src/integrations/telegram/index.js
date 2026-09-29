import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Send a Telegram message. Optional inline keyboard for Approve/Reject.
 * No-ops (warns) when unconfigured so alert paths never crash a transaction's
 * caller (alerts are always best-effort, fired after commit).
 */
export async function sendTelegram(text, { buttons, chatId = env.TELEGRAM_CHAT_ID } = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) {
    logger.warn('Telegram not configured; skipping alert');
    return { skipped: true };
  }
  const reply_markup = buttons
    ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))] }
    : undefined;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup }),
  });
  if (!res.ok) logger.error({ status: res.status }, 'Telegram send failed');
  return res.json().catch(() => ({}));
}
