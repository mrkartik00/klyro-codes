#!/usr/bin/env bash
# Post-deploy smoke check: verify each Klyro surface responds as expected.
# Usage: smoke-check.sh [api_base] (default https://api.klyro.codes/api/v1)
set -euo pipefail
API="${1:-https://api.klyro.codes/api/v1}"
fail=0

check() {
  local desc="$1" method="$2" path="$3" want="$4"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$API$path" \
    -H 'content-type: application/json' ${5:+-d "$5"})"
  if [ "$code" = "$want" ]; then
    echo "PASS  $desc ($code)"
  else
    echo "FAIL  $desc (got $code, want $want)"; fail=1
  fi
}

check "health"            GET  /health/live 200
check "admin needs auth"  GET  /admin/leads 401
check "enquiry validates" POST /public/enquiries 400 '{}'
check "webhook bad sig"   POST /webhooks/razorpay 400 '{}'

exit $fail
