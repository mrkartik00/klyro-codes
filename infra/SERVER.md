# Klyro server & deployment

## VPS facts (verified)
- Host `kartik-india-8gb`, Ubuntu 24.04, **unprivileged LXC container**, 4 vCPU / 8 GB (~7.5 GB free), 70 GB disk.
- Public IPv4 `148.113.8.82` is **NAT'd** (internal `10.10.10.13`); SSH on port **20011**.
- TLS is terminated by the **provider's front proxy**; nginx here listens on **:80 only** and still serves HTTPS externally.
- IPv6 (`2402:1f00:8300:452::75`) currently shows `dadfailed` — unusable until the provider fixes it.
- Already running on the box: nginx, Redis (localhost), PM2 apps `janki-backend`, `bocc-backend`, `boc-backend`, `boc-frontend`. **Do not disturb these.**
- Docker: not installed. May not run without LXC **nesting** — ask the provider to enable it. If unavailable, run n8n natively (below).

## Ports & Redis DBs
- Klyro API: `127.0.0.1:4100` (PM2 cluster, 2 instances).
- n8n main: `127.0.0.1:5678`.
- Redis: shared instance. JankiCare uses db 0; **Klyro app uses db 3**, **n8n queue uses db 2**.

## First-time setup
1. **Harden SSH** (keep a second session open while testing):
   - `PasswordAuthentication no`, `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config`, then `systemctl reload ssh`.
   - Install fail2ban: `apt install fail2ban`.
   - Do NOT add ufw before confirming which ports the provider forwards, or you may cut off the live sites.
2. **DNS (Spaceship):** point `api.`, `app.`, `admin.`, `n8n.` and the apex `klyro.codes` at `148.113.8.82`. Replace the wildcard redirect.
3. **App dir:** `/var/www/klyro` with `server/`, `shared/`, `web/`, `portal/`, `admin/`. Put the production `server/.env` here (never commit it).
4. **nginx:** copy `infra/nginx/klyro.conf` and `n8n.conf` to `/etc/nginx/sites-available/`, symlink into `sites-enabled/`, `nginx -t && systemctl reload nginx`. Create the n8n basic-auth file: `htpasswd -c /etc/nginx/.htpasswd-n8n kartik`.
5. **API:** `npm ci --omit=dev -w server`, then `pm2 start infra/ecosystem.config.cjs && pm2 save`.
6. **MongoDB:** Atlas free cluster (replica set — transactions require it). Put the SRV URI in `.env`.
7. **Seed admin:** `node server/scripts/seed.js` (set `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).

## n8n (queue mode)
- **With Docker (preferred, needs nesting):** fill `infra/.env` with `N8N_DB_PASSWORD`, `N8N_ENCRYPTION_KEY`, `KLYRO_HMAC_SECRET` (= server `INTERNAL_HMAC_SECRET`), `KLYRO_WORKSPACE_ID`, then `docker compose -f infra/docker-compose.n8n.yml up -d`.
- **Without Docker (native):** `apt install postgresql`, create the `n8n` db/user; `npm i -g n8n@2`; run three PM2 apps (`n8n-main` = `n8n start`, two workers = `n8n worker`) all with `EXECUTIONS_MODE=queue`, `QUEUE_BULL_REDIS_DB=2`, and the same `N8N_ENCRYPTION_KEY`. Back up that key offline.
- Import workflows from `n8n/workflows/` (start with `00-klyro-api-signer`). Set env vars `KLYRO_API_BASE`, `KLYRO_HMAC_SECRET`, `KLYRO_WORKSPACE_ID`, `SCRAPER_BASE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WARMUP_RECIPIENTS`.

## Scraper & verifier
- gosom scraper: run as a PM2 app bound to `127.0.0.1:8080`, concurrency 2 (Chromium is memory-hungry — cap it).
- Reacher email verifier: only if outbound port 25 is open (`nc -vz gmail-smtp-in.l.google.com 25`). Otherwise skip; the syntax+MX check plus the 3% bounce auto-pause protect deliverability.

## Backups & monitoring
- Cron `infra/scripts/backup.sh` nightly (mongodump + pg_dump → Spaces `klyro/backups/`).
- Restore drill: `infra/scripts/restore.sh <archive>` into a scratch DB.
- Uptime Kuma (native or container) watching all subdomains + n8n workers.
- Post-deploy: `infra/scripts/smoke-check.sh https://api.klyro.codes/api/v1`.

## Memory budget (~8 GB)
Existing PM2 apps ~0.3 GB · Klyro API (2 workers) ~0.4 GB · n8n main+2 workers ~1.5 GB · Postgres ~0.3 GB · scraper+Chromium ~1–2 GB. Fits with headroom if scraper concurrency stays low.
