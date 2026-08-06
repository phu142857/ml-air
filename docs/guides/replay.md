# Replay

Recover failed runs and re-dispatch durable events.

## Run replay (from a task)

Replay a failed run from a selected task without re-running upstream work when the DAG allows it.

### Steps

1. Identify failed `task_id` in the original run.
2. Trigger replay from that task (API below, Hub **Traces** → task span → **Re-run from task**, or run detail controls).
3. Monitor the replay run until a terminal state.

### Command

**Auth:** maintainer+ — `$TOKEN` from [Login and Identity](./login-and-identity.md).

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

Only the selected branch is replayed; replay metadata appears on the run timeline.

## DLQ replay

When tasks land in the run DLQ after terminal failure:

```bash
curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/dlq/replay" \
  -H "Authorization: Bearer $TOKEN"
```

Response includes `replayed` count; the scheduler processes requeued items.

To seed a failure for testing:

```bash
curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/runs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"always_fail_pipeline","idempotency_key":"dlq-guide-001"}'
```

## Domain Event outbox replay

Re-dispatch stored Domain Event envelopes (audit / metrics / domain webhooks). Requires `ML_AIR_DOMAIN_EVENT_OUTBOX=1` and migration **0050+**.

```bash
curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/domain-events/outbox/replay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"outbox_ids":["<outbox_id>"], "mark_delivered": true}'
```

List rows:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/domain-events/outbox?delivered=no&limit=50"
```

Handlers are idempotent — see [Domain Events](../architecture/domain-events.md#idempotency-on-replay).

## Semantic event outbox replay

For Hub realtime envelopes (separate from Domain Events):

```bash
curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/semantic-events/outbox/replay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"outbox_ids":["<outbox_id>"], "mark_delivered": true}'
```

See [Realtime event envelope](../api/realtime-event-envelope.md#durable-outbox-optional).

## Manifest security validation

Re-scan historical manifests for signing policy drift:

```bash
make backfill-lineage
```

Document findings in your incident log and update key policy if needed. See [Manifest security](../troubleshooting/manifest-security.md).

## Troubleshooting

| Symptom | Next step |
|---------|-----------|
| Replay blocked | [Common errors](../troubleshooting/common-errors.md) |
| Task still failing | [Debugging](./debugging.md) |
| DLQ empty | Confirm run status `FAILED` and scheduler health |

## Related

- [Retry a failed task](./retry-failed-task.md)
- [Trace explorer](./use-trace-explorer.md) — re-run from task in UI
- [Lineage / replay reference](../troubleshooting/lineage-replay-v03-reference.md)
