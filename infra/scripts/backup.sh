#!/usr/bin/env bash
# Nightly backup: MongoDB (Atlas) + n8n Postgres → DigitalOcean Spaces.
# Requires: mongodump, pg_dump, s3cmd (or aws cli configured for Spaces).
# Env: MONGODB_URI, N8N_PG_URI, SPACES_BUCKET (e.g. s3://kartiksspace/klyro/backups)
set -euo pipefail

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[backup] mongodump…"
mongodump --uri="$MONGODB_URI" --archive="$TMP/mongo-$STAMP.gz" --gzip

echo "[backup] pg_dump (n8n)…"
pg_dump "$N8N_PG_URI" | gzip > "$TMP/n8n-pg-$STAMP.sql.gz"

echo "[backup] upload to Spaces…"
for f in "$TMP"/*; do
  s3cmd put "$f" "$SPACES_BUCKET/$(basename "$f")"
done

echo "[backup] prune local + remote older than 30 days…"
# Remote prune is manual/lifecycle-policy; keep this script idempotent.
echo "[backup] done: $STAMP"
