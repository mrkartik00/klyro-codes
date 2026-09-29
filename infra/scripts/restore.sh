#!/usr/bin/env bash
# Restore a MongoDB archive into a scratch database and print collection counts,
# for the restore drill (T21). Does NOT touch production.
# Usage: restore.sh <mongo-archive.gz> [scratch-db-uri]
set -euo pipefail

ARCHIVE="${1:?path to mongodump archive required}"
SCRATCH="${2:-mongodb://127.0.0.1:27017/klyro_restore_test}"

echo "[restore] restoring $ARCHIVE into $SCRATCH…"
mongorestore --uri="$SCRATCH" --archive="$ARCHIVE" --gzip --drop

echo "[restore] collection counts:"
mongosh "$SCRATCH" --quiet --eval '
  db.getCollectionNames().forEach(function (c) {
    print(c + ": " + db.getCollection(c).countDocuments());
  });
'
echo "[restore] drill complete. Drop $SCRATCH when finished."
