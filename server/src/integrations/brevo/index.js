import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const API = 'https://api.brevo.com/v3/smtp/email';

/**
 * Send a transactional email via Brevo. No-ops with a warning when no API key
 * is configured (dev/test), so flows don't crash. Never used for cold email.
 */
export async function sendTransactional({ to, subject, htmlContent, params, templateId }) {
  if (!env.BREVO_API_KEY) {
    logger.warn({ to, subject }, 'BREVO_API_KEY not set; skipping email send');
    return { skipped: true };
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Klyro', email: 'noreply@klyro.codes' },
      to: [{ email: to }],
      subject,
      htmlContent,
      params,
      templateId,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function sendVerificationOtp(to, code) {
  return sendTransactional({
    to,
    subject: 'Verify your Klyro account',
    htmlContent: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
  });
}

export async function sendPasswordReset(to, link) {
  return sendTransactional({
    to,
    subject: 'Reset your Klyro password',
    htmlContent: `<p>Reset your password: <a href="${link}">${link}</a> (valid 1 hour).</p>`,
  });
}
