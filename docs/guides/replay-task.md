# Replay Task

## Goal

Replay a run from a failed task and validate replay success.

## Steps

1. Identify failed `task_id`.
2. Create replay run from that task.
3. Monitor replay run status and logs.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/replay" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"from_task_id":"<task_id>","idempotency_key":"replay-001"}'
```

## Result

Replay run is created and reaches terminal success when replay policy checks pass.

## Done

If replay is blocked, check [Troubleshooting](../troubleshooting/common-errors.md).
