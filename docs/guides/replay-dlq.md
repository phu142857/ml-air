# Replay from DLQ

## Goal

Replay failed tasks from DLQ for a run.

## Steps

1. Trigger an always-fail pipeline.
2. Confirm run status is `FAILED`.
3. Replay DLQ items for that run.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"always_fail_pipeline","idempotency_key":"dlq-guide-001"}'

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/dlq/replay" \
  -H "Authorization: Bearer $TOKEN"
```

## Result

Replay endpoint returns `replayed` count and scheduler processes requeued items.

## Done

Use [Partial Replay](./partial-replay.md) for DAG-aware replay from a task.
