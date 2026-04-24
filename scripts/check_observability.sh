#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${ML_AIR_BASE_URL:-http://localhost:8080}"
PROM_URL="${ML_AIR_PROMETHEUS_URL:-http://localhost:39090}"
GRAFANA_URL="${ML_AIR_GRAFANA_URL:-http://localhost:33000}"

echo "[1/6] API health"
curl -fsS "${API_BASE_URL}/health" >/dev/null

echo "[2/6] API metrics endpoint"
curl -fsS "${API_BASE_URL}/metrics" | rg -q "mlair_api_"

echo "[3/6] Scheduler metrics endpoint"
curl -fsS "http://localhost:9102/metrics" | rg -q "mlair_scheduler_"

echo "[4/6] Executor metrics endpoint"
curl -fsS "http://localhost:9103/metrics" | rg -q "mlair_executor_"

echo "[5/6] Prometheus targets/rules readiness"
curl -fsS "${PROM_URL}/-/ready" >/dev/null
curl -fsS "${PROM_URL}/api/v1/rules" | rg -q "MlAirTaskFailuresDetected"

echo "[6/6] Grafana health"
curl -fsS "${GRAFANA_URL}/api/health" | rg -q "\"database\":\"ok\""

echo "[PASS] observability stack is healthy"
