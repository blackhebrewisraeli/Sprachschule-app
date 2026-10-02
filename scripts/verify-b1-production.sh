#!/usr/bin/env bash
# B1 production verification battery (B0 Task 12 + B1 Task 11 checks).
#
# Usage:
#   ./scripts/verify-b1-production.sh
#   BASE_URL=https://www.sprachschule-app.com ./scripts/verify-b1-production.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://www.sprachschule-app.com}"
CHAT_BODY='{"model":"claude-haiku-4-5-20251001","max_tokens":16,"messages":[{"role":"user","content":"Hallo"}]}'
PASS=0
FAIL=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ ${label}: ${actual}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${label}: expected ${expected}, got ${actual}" >&2
    FAIL=$((FAIL + 1))
  fi
}

echo "Production API checks → ${BASE_URL}"
echo

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/v1/ai/chat" \
  -H 'Content-Type: application/json' -d "$CHAT_BODY")
check 'POST /api/v1/ai/chat (happy path)' 200 "$code"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/chat" \
  -H 'Content-Type: application/json' -d "$CHAT_BODY")
check 'POST /api/chat (legacy shim)' 200 "$code"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/v1/ai/chat" \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d "$CHAT_BODY")
check 'foreign Origin rejected' 403 "$code"

body=$(curl -sS -X POST "${BASE_URL}/api/v1/ai/chat" \
  -H 'Content-Type: application/json' -d '{"model":"gpt-4"}')
if echo "$body" | grep -q '"code":"bad_request"'; then
  echo '  ✓ garbage body → bad_request envelope'
  PASS=$((PASS + 1))
else
  echo "  ✗ garbage body: expected bad_request envelope, got: ${body}" >&2
  FAIL=$((FAIL + 1))
fi

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "All ${PASS} checks passed."
  echo
  echo "Manual follow-ups:"
  echo "  • Vercel function logs: no 'using per-instance MemoryStore' after a chat call"
  echo "  • Supabase Table Editor → rate_limits: rows appear after 2–3 prod AI calls"
  exit 0
fi

echo "${FAIL} check(s) failed, ${PASS} passed." >&2
exit 1
