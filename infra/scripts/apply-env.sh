#!/usr/bin/env bash
# Install an env file from stdin if it differs from the current one.
# Usage (on the VPS): apply-env.sh <target-path> < new.env
# Prints "changed" or "unchanged". Keeps the last 5 backups next to the file.
set -euo pipefail
target="$1"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
# Normalise: drop CRs and trailing blank lines (GitHub trims secrets), end with one newline.
norm() { tr -d '\r' | awk '{ l[NR] = $0 } END { n = NR; while (n > 0 && l[n] == "") n--; for (i = 1; i <= n; i++) print l[i] }'; }
norm > "$tmp"
# Refuse empty/garbage input so a missing secret can never wipe production config.
if [ "$(grep -cE '^[A-Z][A-Z0-9_]*=' "$tmp")" -lt 5 ]; then
  echo "refusing to apply $target: input has fewer than 5 variables" >&2
  exit 1
fi
if [ -f "$target" ] && cmp -s "$tmp" <(norm < "$target"); then
  echo "unchanged"
  exit 0
fi
if [ -f "$target" ]; then
  cp -p "$target" "$target.bak-$(date +%Y%m%d%H%M%S)"
  ls -1t "$target".bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
fi
install -m 600 "$tmp" "$target"
echo "changed"
