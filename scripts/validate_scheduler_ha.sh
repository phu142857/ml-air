  #!/usr/bin/env bash
# Wave 1: validate scheduler tick-lock with 2 replicas (quickstart compose).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.quickstart.yml}"
COMPOSE_HA_OVERRIDE="${COMPOSE_HA_OVERRIDE:-deploy/docker-compose.scheduler-ha.override.yml}"
WAIT_SEC="${SCHEDULER_HA_WAIT_SEC:-45}"
REDIS_PORT="${ML_AIR_REDIS_PORT:-6379}"
LOCK_KEY="mlair:scheduler:tick-lock:validate_ha_script"

cd "$ROOT"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

compose_ha() {
  docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_HA_OVERRIDE" "$@"
}

restore_single_scheduler() {
  compose up -d --scale scheduler=1 --force-recreate scheduler >/dev/null 2>&1 || true
}

redis_cli() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli -h 127.0.0.1 -p "$REDIS_PORT" PING >/dev/null 2>&1; then
    redis-cli -h 127.0.0.1 -p "$REDIS_PORT" "$@"
    return
  fi
  compose exec -T redis redis-cli "$@"
}

scheduler_metrics() {
  local cid
  cid="$(compose_ha ps scheduler --status running -q 2>/dev/null | head -n1)"
  if [[ -z "$cid" ]]; then
    echo "[FAIL] no running scheduler container for metrics" >&2
    return 1
  fi
  docker exec "$cid" python -c "
import urllib.request
print(urllib.request.urlopen('http://127.0.0.1:9102/metrics', timeout=10).read().decode())
"
}

trap restore_single_scheduler EXIT

echo "[1/5] Redis tick-lock semantics (SET NX)"
redis_cli DEL "$LOCK_KEY" >/dev/null 2>&1 || true
first="$(redis_cli SET "$LOCK_KEY" replica-a NX EX 10)"
if [[ "$first" != "OK" ]]; then
  echo "[FAIL] first SET NX expected OK, got: ${first:-<empty>}" >&2
  exit 1
fi
second="$(redis_cli SET "$LOCK_KEY" replica-b NX EX 10 || true)"
if [[ -n "$second" && "$second" != "(nil)" ]]; then
  echo "[FAIL] second SET NX expected (nil), got: $second" >&2
  redis_cli DEL "$LOCK_KEY" >/dev/null 2>&1 || true
  exit 1
fi
redis_cli DEL "$LOCK_KEY" >/dev/null 2>&1 || true
echo "  OK redis NX lock behaves as scheduler expects"

echo "[2/5] Scale scheduler to 2 replicas (no host metrics port — HA override)"
compose_ha rm -sf scheduler >/dev/null 2>&1 || true
compose_ha up -d --scale scheduler=2 --force-recreate scheduler

echo "[3/5] Wait ${WAIT_SEC}s for periodic ticks"
sleep "$WAIT_SEC"

echo "[4/5] Scheduler metrics (tick_lock_skipped)"
metrics="$(scheduler_metrics)"
if ! grep -q 'mlair_scheduler_tick_lock_skipped_total' <<<"$metrics"; then
  echo "[FAIL] metric mlair_scheduler_tick_lock_skipped_total not found" >&2
  exit 1
fi

skipped="$(grep -E '^mlair_scheduler_tick_lock_skipped_total' <<<"$metrics" | awk '{s+=$2} END {print s+0}')"
echo "  tick_lock_skipped sum=$skipped"
if [[ "${skipped:-0}" -lt 1 ]]; then
  echo "[WARN] expected skipped_total >= 1 with 2 replicas (increase SCHEDULER_HA_WAIT_SEC or check ML_AIR_SCHEDULER_TICK_LOCK=1)"
fi

running="$(compose_ha ps scheduler --status running -q 2>/dev/null | wc -l | tr -d ' ')"
echo "  scheduler containers running=$running"
if [[ "${running:-0}" -lt 2 ]]; then
  echo "[FAIL] expected 2 running scheduler containers" >&2
  exit 1
fi

echo "[5/5] Restore single scheduler replica (host :9102 metrics restored)"
restore_single_scheduler
trap - EXIT

echo "[PASS] validate_scheduler_ha"
