# Retry a Failed Task

## Goal

Validate automatic retry behavior for a failing task.

## Steps

1. Trigger a fail-once pipeline.
2. Monitor task attempts.
3. Verify terminal run success.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"fail_once_pipeline","idempotency_key":"retry-guide-001"}'
```

## Result

At least one task has `attempt > 1`, and run reaches success.

## Done

Continue with [Replay from DLQ](./replay-dlq.md) for terminal failures.
