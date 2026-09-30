import { Router } from 'express';
import { z } from 'zod';
import { registerSchema, loginSchema, emailSchema } from '@klyro/shared/schemas';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../services/auth.service.js';

export const authRouter = Router();

const ctx = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

authRouter.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => created(res, await auth.register(req.body))),
);

authRouter.post(
  '/verify',
  authLimiter,
  validateBody(z.object({ email: emailSchema, code: z.string().length(6) })),
  asyncHandler(async (req, res) => ok(res, await auth.verifyEmail(req.body))),
);

authRouter.post(
  '/verify/resend',
  authLimiter,
  validateBody(z.object({ email: emailSchema })),
  asyncHandler(async (req, res) => ok(res, await auth.resendVerification(req.body))),
);

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => ok(res, await auth.login({ ...req.body, ...ctx(req) }))),
);

authRouter.post(
  '/refresh',
  validateBody(z.object({ refreshToken: z.string() })),
  asyncHandler(async (req, res) => ok(res, await auth.refresh({ ...req.body, ...ctx(req) }))),
);

authRouter.post(
  '/forgot',
  authLimiter,
  validateBody(z.object({ email: emailSchema })),
  asyncHandler(async (req, res) => ok(res, await auth.requestPasswordReset(req.body))),
);

authRouter.post(
  '/reset',
  authLimiter,
  validateBody(z.object({ email: emailSchema, token: z.string(), password: z.string().min(12) })),
  asyncHandler(async (req, res) => ok(res, await auth.resetPassword(req.body))),
);

// F44 — magic-link login.
authRouter.post(
  '/magic-link',
  authLimiter,
  validateBody(z.object({ email: emailSchema })),
  asyncHandler(async (req, res) => ok(res, await auth.requestMagicLink(req.body))),
);
authRouter.post(
  '/magic-link/verify',
  authLimiter,
  validateBody(z.object({ email: emailSchema, token: z.string() })),
  asyncHandler(async (req, res) => ok(res, await auth.loginWithMagicLink({ ...req.body, ...ctx(req) }))),
);

authRouter.post(
  '/2fa/setup',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await auth.setupTotp({ userId: req.auth.userId }))),
);

authRouter.post(
  '/2fa/confirm',
  requireAuth,
  validateBody(z.object({ token: z.string().regex(/^\d{6}$/) })),
  asyncHandler(async (req, res) =>
    ok(res, await auth.confirmTotp({ userId: req.auth.userId, token: req.body.token })),
  ),
);

authRouter.get('/me', requireAuth, (req, res) => ok(res, req.auth));
