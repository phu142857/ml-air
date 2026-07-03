#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${ML_AIR_BASE_URL:-http://localhost:8080}"
PROM_URL="${ML_AIR_PROMETHEUS_URL:-http://localhost:39090}"
GRAFANA_URL="${ML_AIR_GRAFANA_URL:-http://localhost:33000}"
SCHEDULER_METRICS_PORT="${ML_AIR_SCHEDULER_METRICS_PORT:-9102}"
EXECUTOR_METRICS_PORT="${ML_AIR_EXECUTOR_METRICS_PORT:-9103}"

echo "[1/6] API health"
curl -fsS "${API_BASE_URL}/health" >/dev/null || {
  echo "[FAIL] API not reachable at ${API_BASE_URL} — start stack (mlair rebuild) before observability checks." >&2
  exit 1
}

echo "[2/6] API metrics endpoint"
api_metrics="$(mktemp)"
curl -fsS "${API_BASE_URL}/metrics" >"${api_metrics}"
grep -q "mlair_api_" "${api_metrics}"
rm -f "${api_metrics}"

echo "[3/6] Scheduler metrics endpoint"
scheduler_metrics="$(mktemp)"
curl -fsS "http://localhost:${SCHEDULER_METRICS_PORT}/metrics" >"${scheduler_metrics}"
grep -q "mlair_scheduler_" "${scheduler_metrics}"
rm -f "${scheduler_metrics}"

echo "[4/6] Executor metrics endpoint"
executor_metrics="$(mktemp)"
curl -fsS "http://localhost:${EXECUTOR_METRICS_PORT}/metrics" >"${executor_metrics}"
grep -q "mlair_executor_" "${executor_metrics}"
rm -f "${executor_metrics}"

echo "[5/6] Prometheus targets/rules readiness"
curl -fsS "${PROM_URL}/-/ready" >/dev/null
prom_rules="$(mktemp)"
curl -fsS "${PROM_URL}/api/v1/rules" >"${prom_rules}"
grep -q "MlAirTaskFailuresDetected" "${prom_rules}"
grep -q "MlAirLifecycleEligibilityDeniedBurst" "${prom_rules}"
rm -f "${prom_rules}"

echo "[6/6] Grafana health"
grafana_health="$(mktemp)"
curl -fsS "${GRAFANA_URL}/api/health" >"${grafana_health}"
grep -qE '"database"[[:space:]]*:[[:space:]]*"ok"' "${grafana_health}"
rm -f "${grafana_health}"

echo "[PASS] observability stack is healthy"
