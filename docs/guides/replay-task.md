# Replay a Failed Run

## Goal

Replay a failed run from a selected task and validate recovery.

## Steps

1. Identify failed `task_id` in the original run.
2. Trigger replay from that task.
3. Monitor replay run until terminal state.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/replay" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"from_task_id":"<task_id>","idempotency_key":"replay-001"}'
python ./mlair logs <replay_run_id> --limit 200
```

## Result

A replay run is created and branch tasks execute again from the selected failure point.

## Done

If replay is blocked, check [Troubleshooting](../troubleshooting/common-errors.md) and [Replay from DLQ](./replay-dlq.md).
