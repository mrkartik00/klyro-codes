#!/usr/bin/env bash
# Copy the live VPS env files into GitHub secrets (run from your Mac).
# GitHub secrets are the source of truth: every deploy writes them back to the
# VPS. Run this after editing an env file directly on the server, otherwise the
# next deploy restores the GitHub version.
#   bash infra/scripts/push-env-secrets.sh
set -euo pipefail
: "${SSH_TARGET:=root@148.113.8.82}"
: "${SSH_PORT:=20011}"
umask 077
t="$(mktemp -d)"
trap 'rm -rf "$t"' EXIT
ssh -p "$SSH_PORT" "$SSH_TARGET" 'cat /var/www/klyro/server/.env' > "$t/server.env"
ssh -p "$SSH_PORT" "$SSH_TARGET" 'cat /etc/klyro/n8n.env' > "$t/n8n.env"
gh secret set SERVER_ENV < "$t/server.env"
gh secret set N8N_ENV < "$t/n8n.env"
gh secret set -f "$t/server.env"   # also one secret per variable
echo "GitHub secrets updated: SERVER_ENV, N8N_ENV + $(grep -cE '^[A-Z0-9_]+=' "$t/server.env") variables"
