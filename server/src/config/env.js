// Validate and freeze environment configuration at boot. Fail fast on misconfig.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  API_BASE_URL: z.string().default('http://localhost:4100'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  PORTAL_ORIGIN: z.string().default('http://localhost:5174'),
  ADMIN_ORIGIN: z.string().default('http://localhost:5175'),

  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),

  // AES-256-GCM key: 32 bytes as 64 hex chars.
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars'),
  INTERNAL_HMAC_SECRET: z.string().min(16),

  DO_SPACES_ENDPOINT: z.string().default('https://sgp1.digitaloceanspaces.com'),
  DO_SPACES_REGION: z.string().default('sgp1'),
  DO_SPACES_BUCKET: z.string().default('kartiksspace'),
  DO_SPACES_CDN_ENDPOINT: z.string().optional(),
  DO_SPACES_ACCESS_KEY: z.string().optional(),
  DO_SPACES_SECRET_KEY: z.string().optional(),
  DO_SPACES_PREFIX: z.string().default('klyro'),

  BREVO_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_FALLBACK_MODEL: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  // Lead sources beyond Reddit (all optional; a source without its key is skipped).
  BSKY_HANDLE: z.string().optional(), // e.g. klyro.bsky.social
  BSKY_APP_PASSWORD: z.string().optional(), // Bluesky → Settings → App passwords
  BRAVE_API_KEY: z.string().optional(), // finds public LinkedIn / X posts via web search
  X_BEARER_TOKEN: z.string().optional(), // official X API (pay-per-use)
  X_MONTHLY_READ_CAP: z.coerce.number().int().default(3000), // hard cap on paid X post reads/month
  SAM_API_KEY: z.string().optional(), // US federal tenders (sam.gov)
  // Lead discovery + enrichment providers (all free-tier; a source without its key is skipped).
  GOOGLE_PLACES_API_KEY: z.string().optional(), // Places API (New) text search — businesses
  APIFY_TOKEN: z.string().optional(), // Apify actors (e.g. Google Maps crawler)
  APIFY_PLACES_ACTOR: z.string().optional(), // default compass~crawler-google-places
  APIFY_LINKEDIN_ACTOR: z.string().optional(), // LinkedIn people/search actor for profile leads
  FIRECRAWL_API_KEY: z.string().optional(), // website fetch/read for enrichment
  SCRAPINGBEE_API_KEY: z.string().optional(), // website fetch via proxies (enrichment fallback)
  SCRAPLING_URL: z.string().optional(), // optional self-hosted Scrapling HTTP sidecar
  // Social outreach (Unipile). Sending is OFF unless this is explicitly 'true'.
  LINKEDIN_SENDING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DIGEST_CRON: z.string().optional(), // morning digest time (default 07:30)
  DIGEST_TZ: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  PAGESPEED_API_KEY: z.string().optional(),
  COMPANIES_HOUSE_API_KEY: z.string().optional(),
  N8N_WEBHOOK_URL: z.string().optional(),
  PUBLIC_API_URL: z.string().optional(),
  N8N_API_URL: z.string().optional(),
  N8N_API_KEY: z.string().optional(),
  TURNSTILE_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
});

// In test mode, inject safe defaults so config never blocks unit tests.
if (process.env.NODE_ENV === 'test') {
  process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/klyro-test';
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-chars-long';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-chars-long';
  process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
  process.env.INTERNAL_HMAC_SECRET ??= 'test-internal-hmac-secret';
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  process.stderr.write(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = [env.WEB_ORIGIN, env.PORTAL_ORIGIN, env.ADMIN_ORIGIN];
