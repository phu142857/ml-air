#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${ML_AIR_BASE_URL:-http://localhost:8080}"
PROM_URL="${ML_AIR_PROMETHEUS_URL:-http://localhost:39090}"
TENANT_ID="${ML_AIR_TENANT_ID:-default}"
PROJECT_ID="${ML_AIR_PROJECT_ID:-default_project}"

echo "[1/5] Trigger failure run (always_fail_pipeline)"
RUN_RESP="$(curl -fsS -X POST \
  "${API_BASE_URL}/v1/tenants/${TENANT_ID}/projects/${PROJECT_ID}/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d "{\"pipeline_id\":\"always_fail_pipeline\",\"idempotency_key\":\"incident-drill-$(date +%s)\"}")"

RUN_ID="$(python -c 'import json,sys; print(json.loads(sys.argv[1]).get("run_id",""))' "${RUN_RESP}")"
if [[ -z "${RUN_ID}" ]]; then
  echo "[FAIL] could not parse run_id from trigger response: ${RUN_RESP}"
  exit 1
fi
echo "run_id=${RUN_ID}"

echo "[2/5] Wait until run becomes FAILED"
for i in $(seq 1 40); do
  RUN_STATUS="$(curl -fsS \
    "${API_BASE_URL}/v1/tenants/${TENANT_ID}/projects/${PROJECT_ID}/runs/${RUN_ID}" \
    -H "Authorization: Bearer viewer-token" | python -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
  if [[ "${RUN_STATUS}" == "FAILED" ]]; then
    echo "run status=FAILED"
    break
  fi
  sleep 1
done

if [[ "${RUN_STATUS:-}" != "FAILED" ]]; then
  echo "[FAIL] run did not reach FAILED state in time"
  exit 1
fi

echo "[3/5] Validate DLQ replay path still works"
REPLAY_RESP="$(curl -fsS -X POST \
  "${API_BASE_URL}/v1/tenants/${TENANT_ID}/projects/${PROJECT_ID}/runs/${RUN_ID}/dlq/replay" \
  -H "Authorization: Bearer maintainer-token")"
echo "${REPLAY_RESP}" | rg -q "\"replayed\""

echo "[4/5] Wait for Prometheus alert visibility"
ALERT_FOUND="0"
for i in $(seq 1 75); do
  ALERTS_JSON="$(curl -fsS "${PROM_URL}/api/v1/alerts")"
  if echo "${ALERTS_JSON}" | rg -q "MlAirTaskFailuresDetected"; then
    ALERT_FOUND="1"
    break
  fi
  sleep 1
done

if [[ "${ALERT_FOUND}" != "1" ]]; then
  echo "[FAIL] alert MlAirTaskFailuresDetected not visible in Prometheus"
  exit 1
fi

echo "[5/5] Incident drill passed"
echo "[PASS] fail run + alert pipeline validated"
