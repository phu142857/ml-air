# Lifecycle webhook (training completed / failed)

## Phase 1 status

`notify_lifecycle_webhook` is **not auto-invoked** from run status transitions after
the Domain Event cutover. Configuring `ML_AIR_LIFECYCLE_WEBHOOK_*` alone does not
fire HTTP callbacks today.

**Use instead (current):** semantic webhook subscriptions on `training.completed` /
`training.failed` — see [Semantic webhook cookbook](./semantic-webhook-cookbook.md)
and [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).

The helper in `lifecycle_webhook_service.py` remains as the HTTP implementation for a
future Domain Event webhook sink (Phase 2).

---

## Environment (reserved / Phase 2)

| Variable | Required | Description |
|----------|----------|-------------|
| `ML_AIR_LIFECYCLE_WEBHOOK_URL` | Yes | POST target |
| `ML_AIR_LIFECYCLE_WEBHOOK_HMAC_SECRET` | No | When set, sends `X-MLAir-Signature: sha256=<hex>` |
| `ML_AIR_LIFECYCLE_WEBHOOK_BEARER_TOKEN` | No | Optional `Authorization: Bearer …` |
| `ML_AIR_LIFECYCLE_WEBHOOK_TIMEOUT_SECONDS` | No | Default `15` |

## Intended payload (when re-wired)

```json
{
  "type": "training.completed",
  "tenant_id": "default",
  "project_id": "default_project",
  "run_id": "5cb92e2e-3d21-4827-bc05-9d3dc1c1eae0",
  "status": "SUCCESS",
  "pipeline_id": "vetai_train_pipeline",
  "dataset_version_id": "dv-abc123",
  "model_id": "model-xyz",
  "dataset_id": "ds-clinic",
  "updated_at": "2026-07-05T12:00:00+00:00"
}
```

Failed runs use `"type": "training.failed"` and `"status": "FAILED"`.

## Related

- [Semantic webhook cookbook](./semantic-webhook-cookbook.md)
- [Architecture overview](../architecture/README.md)
