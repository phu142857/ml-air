#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${ML_AIR_BASE_URL:-http://localhost:8080}"
PROM_URL="${ML_AIR_PROMETHEUS_URL:-http://localhost:39090}"
GRAFANA_URL="${ML_AIR_GRAFANA_URL:-http://localhost:33000}"

echo "[1/6] API health"
curl -fsS "${API_BASE_URL}/health" >/dev/null

echo "[2/6] API metrics endpoint"
api_metrics="$(mktemp)"
curl -fsS "${API_BASE_URL}/metrics" >"${api_metrics}"
rg -q "mlair_api_" "${api_metrics}"
rm -f "${api_metrics}"

echo "[3/6] Scheduler metrics endpoint"
scheduler_metrics="$(mktemp)"
curl -fsS "http://localhost:9102/metrics" >"${scheduler_metrics}"
rg -q "mlair_scheduler_" "${scheduler_metrics}"
rm -f "${scheduler_metrics}"

echo "[4/6] Executor metrics endpoint"
executor_metrics="$(mktemp)"
curl -fsS "http://localhost:9103/metrics" >"${executor_metrics}"
rg -q "mlair_executor_" "${executor_metrics}"
rm -f "${executor_metrics}"

echo "[5/6] Prometheus targets/rules readiness"
curl -fsS "${PROM_URL}/-/ready" >/dev/null
prom_rules="$(mktemp)"
curl -fsS "${PROM_URL}/api/v1/rules" >"${prom_rules}"
rg -q "MlAirTaskFailuresDetected" "${prom_rules}"
rm -f "${prom_rules}"

echo "[6/6] Grafana health"
grafana_health="$(mktemp)"
curl -fsS "${GRAFANA_URL}/api/health" >"${grafana_health}"
rg -q "\"database\"\\s*:\\s*\"ok\"" "${grafana_health}"
rm -f "${grafana_health}"

echo "[PASS] observability stack is healthy"
