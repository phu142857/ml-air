# Lifecycle webhook (training completed / failed)

## Recommended: semantic webhooks

Subscribe to `training.completed` / `training.failed` via [Semantic webhook cookbook](./semantic-webhook-cookbook.md). This is the supported path for Hub realtime and outbound HTTP today.

See [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).

## Domain Event webhooks

For lifecycle accountability actions (run.*, model_version.*, etc.), use [Domain webhook delivery](../architecture/domain-events.md#domain-webhook-delivery) (`ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1`).

## Legacy env webhook (`ML_AIR_LIFECYCLE_WEBHOOK_*`)

`notify_lifecycle_webhook` is **not** auto-invoked from run transitions. Configuring `ML_AIR_LIFECYCLE_WEBHOOK_*` alone does not fire HTTP callbacks.

| Variable | Description |
|----------|-------------|
| `ML_AIR_LIFECYCLE_WEBHOOK_URL` | POST target (when re-wired) |
| `ML_AIR_LIFECYCLE_WEBHOOK_HMAC_SECRET` | `X-MLAir-Signature: sha256=<hex>` |
| `ML_AIR_LIFECYCLE_WEBHOOK_BEARER_TOKEN` | Optional bearer |
| `ML_AIR_LIFECYCLE_WEBHOOK_TIMEOUT_SECONDS` | Default `15` |

### Intended payload (reference)

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
