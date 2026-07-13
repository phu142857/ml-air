# Partial Replay

## Goal

Replay a run from a selected failed task without re-running all upstream tasks.

## Steps

1. Open failed run detail.
2. Select failed task as replay root.
3. Trigger partial replay.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/replay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"from_task_id":"<task_id>"}'
```

## Result

Only selected branch is replayed, and replay metadata is recorded on run timeline.

## Done

Proceed to [Debug Run in UI](./debug-run-ui.md).
