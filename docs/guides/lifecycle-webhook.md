# Lifecycle webhook (training completed / failed)

Configure a generic HTTP webhook for training runs that pin a `dataset_version_id`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `ML_AIR_LIFECYCLE_WEBHOOK_URL` | Yes | POST target (e.g. webhook.site URL) |
| `ML_AIR_LIFECYCLE_WEBHOOK_HMAC_SECRET` | No | When set, sends `X-MLAir-Signature: sha256=<hex>` (HMAC-SHA256 of raw body) |
| `ML_AIR_LIFECYCLE_WEBHOOK_BEARER_TOKEN` | No | Optional `Authorization: Bearer …` header |
| `ML_AIR_LIFECYCLE_WEBHOOK_TIMEOUT_SECONDS` | No | Default `15` |

## When it fires

- **`training.completed`** — run reaches `SUCCESS` and `override_config` or `plugin_context` includes `dataset_version_id`
- **`training.failed`** — run reaches `FAILED` with the same pinned version context

Same gating as the internal `training.completed` semantic event (see [realtime-event-envelope](../api/realtime-event-envelope.md)).

## Payload example

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

## Verify signature (optional)

```python
import hmac, hashlib

def verify(body: bytes, header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.strip())
```

## Related

- Model promote webhook: `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` (artifact-based, separate contract)
- Semantic subscriptions: `docs/guides/semantic-webhook-cookbook.md`
