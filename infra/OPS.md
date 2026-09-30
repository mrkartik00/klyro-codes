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
- **G45 n8n — DONE (2026-09-30).** n8n 1.123.82 on a bundled Node 22 at
  `/opt/n8n` (the system Node 20 can't build `isolated-vm`), Postgres 16 (db/user
  `n8n`, localhost only), queue mode on Redis db 2. PM2: `klyro-n8n` (main,
  127.0.0.1:5678) + `klyro-n8n-worker-1/2`. Env + secrets: `/etc/klyro/n8n.env`
  (root, 600). **Back up `N8N_ENCRYPTION_KEY`** from that file; saved
  credentials are unreadable without it. Owner login: `kartik@klyro.codes`,
  password in `/etc/klyro/n8n.owner`. nginx vhost `klyro-n8n.conf`: editor behind
  basic auth (user `klyro`, password in `/etc/klyro/n8n.basicauth`), `/webhook/*`
  open (webhooks verify HMAC). API → n8n via `N8N_WEBHOOK_URL`/`N8N_API_URL`/
  `N8N_API_KEY` in `server/.env` (scoped key: workflow list/activate + executions).
  Workflows: `bash infra/scripts/n8n-sync.sh` (deploy runs it when
  `n8n/workflows/` changes). Still needed: DNS A `n8n` → 148.113.8.82 + AIC
  domain on port 80 (for the editor UI only; automation runs on localhost).
- **G36 gosom — DONE.** v1.18.1 binary at `/opt/gosom`, PM2 `klyro-gosom`,
  web API on 127.0.0.1:8090, data in `/opt/gosom/data`. Chromium runtime libs
  installed via apt.
- **G47 monitoring:** Uptime Kuma (self-hosted, PM2) probing the `/health`
  endpoints; Sentry DSN in server + frontends (free tier). Both need accounts.
- **G49 n8n export:** `.github/workflows/n8n-export.yml` needs repo secrets
  `N8N_URL` and `N8N_API_KEY` once n8n is up.

## Integration keys (set in server/.env or admin Settings, then reload)
GEMINI_API_KEY, TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (+ TELEGRAM_WEBHOOK_SECRET),
RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET, TURNSTILE_SECRET, PAGESPEED_API_KEY,
COMPANIES_HOUSE_API_KEY. Each integration is a no-op until its key is present.
