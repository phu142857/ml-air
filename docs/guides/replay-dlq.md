# Replay from DLQ

## Goal

Replay failed tasks from DLQ for a run.

## Steps

1. Trigger an always-fail pipeline.
2. Confirm run status is `FAILED`.
3. Replay DLQ items for that run.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"always_fail_pipeline","idempotency_key":"dlq-guide-001"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/dlq/replay" \
  -H "Authorization: Bearer maintainer-token"
```

## Result

Replay endpoint returns `replayed` count and scheduler processes requeued items.

## Done

Use [Partial Replay](./partial-replay.md) for DAG-aware replay from a task.
