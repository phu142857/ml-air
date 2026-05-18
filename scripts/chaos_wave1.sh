#!/usr/bin/env bash
# Wave 1 chaos drill: brief realtime outage; API + polling path must stay healthy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.quickstart.yml}"
API_BASE_URL="${ML_AIR_BASE_URL:-http://localhost:8080}"
SKIP_STOP="${CHAOS_SKIP_REALTIME_STOP:-0}"

cd "$ROOT"

echo "[1/6] Baseline Wave 0 verify"
python scripts/verify_execution_realtime.py --api-url "$API_BASE_URL"

echo "[2/6] API health before chaos"
curl -fsS --connect-timeout 2 --max-time 5 "${API_BASE_URL}/health" >/dev/null

if [[ "$SKIP_STOP" == "1" ]]; then
  echo "[SKIP] CHAOS_SKIP_REALTIME_STOP=1 — skipping realtime container stop"
  echo "[PASS] chaos_wave1 (degraded mode)"
  exit 0
fi

echo "[3/6] Stop realtime service briefly"
docker compose -f "$COMPOSE_FILE" stop realtime >/dev/null

echo "[4/6] API still healthy while realtime is down"
sleep 2
curl -fsS --connect-timeout 2 --max-time 5 "${API_BASE_URL}/health" >/dev/null

echo "[5/6] Verify degraded path (API + runtime-config + Redis; realtime stopped)"
if python scripts/verify_execution_realtime.py --api-url "$API_BASE_URL" --degraded; then
  echo "[PASS] api/runtime/redis checks while realtime stopped"
else
  echo "[FAIL] core checks failed with realtime stopped" >&2
  docker compose -f "$COMPOSE_FILE" start realtime >/dev/null || true
  exit 1
fi

echo "[6/6] Restore realtime and full verify"
docker compose -f "$COMPOSE_FILE" start realtime >/dev/null
deadline=$((SECONDS + 60))
until curl -fsS --connect-timeout 2 --max-time 3 "http://localhost:${MLAIR_REALTIME_PORT:-8001}/healthz" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "[FAIL] realtime did not become healthy in time" >&2
    exit 1
  fi
  sleep 2
done
python scripts/verify_execution_realtime.py --api-url "$API_BASE_URL"
echo "[PASS] chaos_wave1 — realtime outage recovered"
