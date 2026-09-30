#!/usr/bin/env bash
# Import every workflow in n8n/workflows into the VPS n8n and re-activate the
# ones that should run. Run on the VPS as root:  bash infra/scripts/n8n-sync.sh
#
# Layout (see infra/OPS.md → n8n):
#   /opt/n8n               n8n install + bundled Node 22 (/opt/n8n/node)
#   /etc/klyro/n8n.env     n8n env + Klyro workflow variables (root, 600)
#   PM2: klyro-n8n (main), klyro-n8n-worker-1/2 (queue workers), klyro-gosom (scraper)
set -euo pipefail

REPO="${REPO:-/var/www/klyro}"
N8N="/opt/n8n/node/bin/node /opt/n8n/node_modules/n8n/bin/n8n"
API_KEY="$(grep '^N8N_API_KEY=' "$REPO/server/.env" | cut -d= -f2-)"

# Workflows kept on after every import. H3/H4 use the "Gmail — admin@klyro.codes"
# credential (connected 2026-09-30). W1 warmup stays manual (needs WARMUP_RECIPIENTS).
ACTIVE=(KlyroH1aMaps0001 KlyroH2Draft0001 KlyroH11Health01 KlyroH3Send00001 KlyroH4Reply0001 KlyroH9Reddit001)

set -a; . /etc/klyro/n8n.env; set +a

for f in "$REPO"/n8n/workflows/*.json; do
  printf '%-32s ' "$(basename "$f")"
  $N8N import:workflow --input="$f" 2>&1 | grep -q 'Successfully' && echo imported || echo FAILED
done

# Imports land inactive; restart so the main process reloads, then activate.
pm2 restart klyro-n8n >/dev/null
for _ in $(seq 1 30); do
  curl -sf http://127.0.0.1:5678/healthz >/dev/null && break
  sleep 2
done
sleep 5

for id in "${ACTIVE[@]}"; do
  curl -s -X POST -H "X-N8N-API-KEY: $API_KEY" "http://127.0.0.1:5678/api/v1/workflows/$id/activate" \
    | grep -q '"active":true' && echo "active   $id" || echo "INACTIVE $id"
done
