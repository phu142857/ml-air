# Partial Replay

## Goal

Replay a run from a selected failed task without re-running all upstream tasks.

## Steps

1. Open failed run detail.
2. Select failed task as replay root.
3. Trigger partial replay.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/replay" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"from_task_id":"<task_id>"}'
```

## Result

Only selected branch is replayed, and replay metadata is recorded on run timeline.

## Done

Proceed to [Debug Run in UI](./debug-run-ui.md).
