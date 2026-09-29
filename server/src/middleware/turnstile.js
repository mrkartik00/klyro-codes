import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Verify a Cloudflare Turnstile token on public forms (B14). When no secret is
 * configured (local/dev), the check is skipped so development isn't blocked —
 * production sets TURNSTILE_SECRET. The honeypot in the route is the second
 * layer.
 */
export function verifyTurnstile({ required = false } = {}) {
  return async (req, _res, next) => {
    if (!env.TURNSTILE_SECRET) {
      if (required && env.NODE_ENV === 'production') {
        return next(new ApiError(500, 'Turnstile not configured', { code: 'CAPTCHA_MISCONFIG' }));
      }
      return next();
    }
    const token = req.body?.turnstileToken || req.get('cf-turnstile-response');
    if (!token) return next(ApiError.badRequest('Captcha required'));
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: req.ip }),
      });
      const data = await res.json();
      if (!data.success) return next(ApiError.badRequest('Captcha failed'));
    } catch (err) {
      logger.error({ err }, 'Turnstile verify error');
      // Fail closed only in production; otherwise allow so an outage doesn't
      // block all inbound leads locally.
      if (env.NODE_ENV === 'production') return next(ApiError.badRequest('Captcha unavailable'));
    }
    // Strip the token so it never reaches validators expecting a strict shape.
    if (req.body) delete req.body.turnstileToken;
    return next();
  };
}
