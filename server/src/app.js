import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { API_PREFIX } from './config/constants.js';
import { corsOrigins, isTest } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { internalRouter } from './routes/internal.routes.js';
import { adminRouter } from './routes/index.js';
import { publicRouter } from './routes/public.routes.js';
import { meRouter } from './routes/me.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';

export function createApp() {
  const app = express();
  // Chain: client → provider TLS proxy → nginx → app. Trust both hops so
  // req.ip is the real client (rate limits / audit IPs are per-visitor).
  app.set('trust proxy', 2);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  // Capture the raw body so internal routes can verify the HMAC signature.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!isTest) app.use(requestLogger);

  // Health is mounted before the rate limiter so probes are never throttled.
  app.use(API_PREFIX, healthRouter);

  // Internal (n8n) routes: HMAC-signed, not subject to the public rate limiter.
  app.use(`${API_PREFIX}/internal`, internalRouter);

  app.use(API_PREFIX, apiLimiter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/public`, publicRouter);
  app.use(`${API_PREFIX}/webhooks`, webhooksRouter);
  app.use(`${API_PREFIX}/me`, meRouter);
  app.use(`${API_PREFIX}/admin`, adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
