# Retry a Failed Task

## Goal

Validate automatic retry behavior for a failing task.

## Steps

1. Trigger a fail-once pipeline.
2. Monitor task attempts.
3. Verify terminal run success.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"fail_once_pipeline","idempotency_key":"retry-guide-001"}'
```

## Result

At least one task has `attempt > 1`, and run reaches success.

## Done

Continue with [Replay](./replay.md) for terminal failures.
