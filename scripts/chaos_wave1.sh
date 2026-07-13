#!/usr/bin/env bash
# Wave 1 chaos drill: brief realtime outage; API + polling path must stay healthy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE_URL="${ML_AIR_BASE_URL:-http://localhost:8080}"
SKIP_STOP="${CHAOS_SKIP_REALTIME_STOP:-0}"
ALLINONE_CONTAINER="${MLAIR_CONTAINER_NAME:-mlair}"
SUPERVISOR_CFG="/etc/supervisor/conf.d/mlair.conf"
WAIT_SEC="${CHAOS_REALTIME_RECOVER_SEC:-90}"

cd "$ROOT"

if [[ -z "${COMPOSE_FILE:-}" ]]; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$ALLINONE_CONTAINER"; then
    COMPOSE_FILE="deploy/docker-compose.allinone.yml"
  else
    COMPOSE_FILE="deploy/docker-compose.quickstart.yml"
  fi
fi

is_allinone() {
  [[ "$COMPOSE_FILE" == *allinone* ]]
}

realtime_health_url() {
  if is_allinone; then
    echo "${API_BASE_URL%/}/healthz"
  else
    echo "http://localhost:${MLAIR_REALTIME_PORT:-8001}/healthz"
  fi
}

_allinone_realtime_pids() {
  docker exec "$ALLINONE_CONTAINER" bash -c \
    'for pid in /proc/[0-9]*; do
       [[ -r "$pid/cmdline" ]] || continue
       cmd=$(tr "\0" " " < "$pid/cmdline" 2>/dev/null || true)
       case "$cmd" in *"uvicorn app.main:app"*"--host 127.0.0.1 --port 8001"*)
         basename "$pid"
       ;; esac
     done'
}

_allinone_signal_realtime() {
  local sig="$1"
  local pids
  pids="$(_allinone_realtime_pids | tr '\n' ' ')"
  if [[ -z "${pids// }" ]]; then
    return 1
  fi
  docker exec "$ALLINONE_CONTAINER" kill "-$sig" $pids >/dev/null 2>&1
}

_allinone_supervisorctl() {
  docker exec "$ALLINONE_CONTAINER" supervisorctl -c "$SUPERVISOR_CFG" "$@" 2>/dev/null
}

stop_realtime() {
  if is_allinone; then
    if _allinone_supervisorctl stop realtime; then
      return 0
    fi
    echo "[WARN] supervisorctl stop failed — using SIGSTOP (run: mlair rebuild for supervisor socket)" >&2
    _allinone_signal_realtime STOP || true
  else
    docker compose -f "$COMPOSE_FILE" stop realtime >/dev/null
  fi
}

start_realtime() {
  if is_allinone; then
    if _allinone_supervisorctl start realtime; then
      return 0
    fi
    echo "[WARN] supervisorctl start failed — using SIGCONT (run: mlair rebuild for supervisor socket)" >&2
    _allinone_signal_realtime CONT || true
  else
    docker compose -f "$COMPOSE_FILE" up -d realtime >/dev/null
  fi
}

wait_realtime_healthy() {
  local url deadline
  url="$(realtime_health_url)"
  deadline=$((SECONDS + WAIT_SEC))
  until curl -fsS --connect-timeout 2 --max-time 5 "$url" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "[FAIL] realtime did not become healthy at ${url} within ${WAIT_SEC}s" >&2
      if is_allinone; then
        docker exec "$ALLINONE_CONTAINER" supervisorctl -c "$SUPERVISOR_CFG" status realtime >&2 || true
      else
        docker compose -f "$COMPOSE_FILE" ps realtime >&2 || true
      fi
      return 1
    fi
    sleep 2
  done
  echo "[PASS] realtime healthy (${url})"
}

echo "[info] compose=${COMPOSE_FILE} api=${API_BASE_URL}"

echo "[1/6] Baseline Wave 0 verify"
python scripts/verify_execution_realtime.py --api-url "$API_BASE_URL"

echo "[2/6] API health before chaos"
curl -fsS --connect-timeout 2 --max-time 5 "${API_BASE_URL}/health" >/dev/null

if [[ "$SKIP_STOP" == "1" ]]; then
  echo "[SKIP] CHAOS_SKIP_REALTIME_STOP=1 — skipping realtime stop"
  echo "[PASS] chaos_wave1 (degraded mode)"
  exit 0
fi

echo "[3/6] Stop realtime briefly"
stop_realtime

echo "[4/6] API still healthy while realtime is down"
sleep 2
curl -fsS --connect-timeout 2 --max-time 5 "${API_BASE_URL}/health" >/dev/null

echo "[5/6] Verify degraded path (API + runtime-config + Redis; realtime stopped)"
if python scripts/verify_execution_realtime.py --api-url "$API_BASE_URL" --degraded; then
  echo "[PASS] api/runtime/redis checks while realtime stopped"
else
  echo "[FAIL] core checks failed with realtime stopped" >&2
  start_realtime || true
  exit 1
fi

echo "[6/6] Restore realtime and full verify"
start_realtime
wait_realtime_healthy
python scripts/verify_execution_realtime.py --api-url "$API_BASE_URL"
echo "[PASS] chaos_wave1 — realtime outage recovered"
