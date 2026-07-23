#!/usr/bin/env bash
# Diagnose Hub WebSocket reconnect / invalid_token on MLAir all-in-one (run ON controller VM).
set -euo pipefail

API="${MLAIR_API:-http://127.0.0.1:8080}"
CONTAINER="${MLAIR_CONTAINER:-ml-air}"

section() { printf '\n===== %s =====\n' "$1"; }

section "Container / supervisor"
if command -v podman >/dev/null 2>&1; then
  RUNTIME=podman
elif command -v docker >/dev/null 2>&1; then
  RUNTIME=docker
else
  echo "No podman/docker found" >&2
  exit 1
fi

$RUNTIME ps -a --filter "name=${CONTAINER}" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
$RUNTIME exec "$CONTAINER" supervisorctl status 2>/dev/null || true

section "Health"
curl -sS "$API/health" | python3 -m json.tool 2>/dev/null || curl -sS "$API/health"
echo
curl -sS "$API/healthz" | python3 -m json.tool 2>/dev/null || curl -sS "$API/healthz"
echo

section "Runtime config (WS URL)"
curl -sS "$API/v1/runtime-config" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("realtime_base_url:", d.get("realtime_base_url")); print("realtime_enabled:", d.get("features",{}).get("realtime_enabled"))'

section "Realtime logs (last 200 lines)"
$RUNTIME logs "$CONTAINER" 2>&1 | rg -i 'realtime|ws_auth_fail|websocket|metrics_listen_failed|FATAL|BACKOFF|invalid_token|auth\.refresh|auth\.login' | tail -200 || true

section "Supervisor realtime log tail"
$RUNTIME exec "$CONTAINER" sh -c 'tail -n 120 /var/log/supervisor/realtime-stderr*.log /var/log/supervisor/realtime-stdout*.log 2>/dev/null' || true

section "WS auth failures count (from container logs)"
$RUNTIME logs "$CONTAINER" 2>&1 | rg -c 'ws_auth_fail' || echo 0

section "Realtime metrics (in-container :9104)"
$RUNTIME exec "$CONTAINER" sh -c 'curl -sS http://127.0.0.1:9104/metrics 2>/dev/null | rg "mlair_realtime_ws|mlair_realtime_redis|mlair_realtime_events"' || echo "(metrics unavailable)"

section "Identity token TTL (needs admin login)"
if [[ -n "${MLAIR_ADMIN_PASSWORD:-}" ]]; then
  TOKEN=$(curl -sS -X POST "$API/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${MLAIR_ADMIN_USER:-admin}\",\"password\":\"$MLAIR_ADMIN_PASSWORD\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')
  if [[ -n "$TOKEN" ]]; then
    curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/system/settings" \
      | python3 -c 'import sys,json; i=json.load(sys.stdin).get("identity",{}); print("access_token_ttl_seconds:", i.get("access_token_ttl_seconds")); print("refresh_token_ttl_seconds:", i.get("refresh_token_ttl_seconds"))'
    echo
    echo "Recent auth audit events:"
    curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/identity/audit?limit=40" \
      | python3 -c 'import sys,json; items=json.load(sys.stdin).get("items",[]); 
for ev in items:
  a=str(ev.get("action") or "")
  if a.startswith("auth."):
    print(ev.get("created_at"), a, ev.get("result"))'
  else
    echo "login failed"
  fi
else
  echo "Set MLAIR_ADMIN_PASSWORD to include identity TTL + auth audit (optional)."
fi

section "Done"
echo "If ws_auth_fail appears often → token expired/invalid at WS connect."
echo "If realtime FATAL/BACKOFF → process crash (check metrics port env)."
echo "If only periodic reconnect ~15m → JWT refresh (expected with current Hub code)."
