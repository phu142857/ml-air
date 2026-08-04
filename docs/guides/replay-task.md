# Replay a Failed Run

## Goal

Replay a failed run from a selected task and validate recovery.

## Steps

1. Identify failed `task_id` in the original run.
2. Trigger replay from that task (API below, or Hub **Traces** → task span → **Re-run from task**).
3. Monitor replay run until terminal state.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/replay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from_task_id":"<task_id>","idempotency_key":"replay-001"}'
python ./mlair logs <replay_run_id> --limit 200
```

## Result

A replay run is created and branch tasks execute again from the selected failure point.

## Done

If replay is blocked, check [Troubleshooting](../troubleshooting/common-errors.md) and [Replay from DLQ](./replay-dlq.md).
