# Klyro — Infrastructure & Ops (Section G)

Status of the plan's infra items and what remains. The VPS is a shared,
provider-managed LXC (AIC Cloud) also running JankiCare/BusinessOrbit — changes
here are made conservatively.

## Done in code / on the VPS
- **G18 hardening:** fail2ban active (sshd jail, ports 22 + 20011); SSH password
  auth disabled, root key-only (provider file neutralised, backup at
  `/root/99-aic-allow-root-pass.conf.klyro-bak`). `ufw` intentionally NOT enabled
  (NAT'd shared box; would risk co-hosted apps — fail2ban covers brute force).
- **G46 backups:** `infra/scripts/backup.mjs` — Node/AWS-SDK based (no apt tools
  needed), dumps all Mongo collections → gzip → DO Spaces `klyro/backups/`.
  Cron installed on the VPS (runs 03:00 UTC). **Requires DO Spaces keys in
  `server/.env` to actually upload** (currently unset → the job errors until set).
- CI/CD: GitHub Actions `ci.yml` (lint+test+build) and `deploy.yml`
  (pull+build+pm2 reload+smoke) with SSH secrets set.

## Requires your keys / decisions (not doable unattended)
- **G48 DO Spaces keys:** create a bucket-scoped key in DigitalOcean, add
  `DO_SPACES_ACCESS_KEY` / `DO_SPACES_SECRET_KEY` to `server/.env`, then
  `pm2 reload klyro-api`. Enables file uploads, PDFs, and backups.
- **G45 n8n queue-mode stack:** Postgres 16 + n8n (native, since the LXC has no
  Docker) as PM2 processes, `EXECUTIONS_MODE=queue`, `QUEUE_BULL_REDIS_DB=2`,
  shared `N8N_ENCRYPTION_KEY`, nginx vhost `n8n.klyro.codes`
  (`infra/nginx/n8n.conf` exists). Then set `N8N_WEBHOOK_URL` / `N8N_API_URL` /
  `N8N_API_KEY` in `server/.env`. Import workflows from `n8n/workflows/*.json`.
- **G36 gosom Maps scraper:** Go binary + Playwright Chromium as a PM2 app on
  127.0.0.1, concurrency 2; n8n's `h1a-maps-scrape` workflow calls it.
- **G47 monitoring:** Uptime Kuma (self-hosted, PM2) probing the `/health`
  endpoints; Sentry DSN in server + frontends (free tier). Both need accounts.
- **G49 n8n export:** `.github/workflows/n8n-export.yml` needs repo secrets
  `N8N_URL` and `N8N_API_KEY` once n8n is up.

## Integration keys (set in server/.env or admin Settings, then reload)
GEMINI_API_KEY, TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (+ TELEGRAM_WEBHOOK_SECRET),
RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET, TURNSTILE_SECRET, PAGESPEED_API_KEY,
COMPANIES_HOUSE_API_KEY. Each integration is a no-op until its key is present.
