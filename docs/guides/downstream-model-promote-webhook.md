# Downstream contract: model promote webhook (MLAir → you)

## Goal

Document the **HTTP contract** MLAir uses when optional env vars are set so a **downstream** system (any app you operate) can align serving or reload weights after **`POST .../models/{model_id}/promote`** succeeds in MLAir.

This is **not** a product-specific integration: MLAir only opens an outbound HTTP POST. One optional illustration: a serving app might expose `http://<serving-host>:<port>/internal/mlair/model-active`—replace host, port, and path with yours.

## When MLAir calls (and when it does not)

MLAir evaluates this **after** the database promotion succeeds. The promote API response is **unchanged** by webhook outcome.

| Condition | Behavior |
|-----------|----------|
| `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` empty / unset | **No HTTP call.** |
| URL set but `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` empty | **No HTTP call** (warning logged). |
| Promoted row has **no non-empty** `artifact_uri` | **No HTTP call** (info logged: skip due to missing artifact). |
| URL + token set and `artifact_uri` non-empty after trim | **POST** once with JSON body (see below). |

Downstream must **not** assume a callback on every promote: absence of a request is normal when configuration or `artifact_uri` is missing.

## HTTP request

| Item | Value |
|------|--------|
| Method | `POST` |
| URL | Full URL from `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` (no path rewriting by MLAir). |
| Header `Content-Type` | `application/json` |
| Header `Authorization` | `Bearer <MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN>` — same shared secret your downstream validates. |
| Body | UTF-8 JSON object (see schema). |
| Timeout | `MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS` (default **15** seconds). |

## JSON body schema (matches implementation)

The payload is built in memory then serialized with **keys whose value is `null` omitted** (`json.dumps` after filtering). Downstream parsers should accept **either** presence or absence of optional keys.

| Field | Required in JSON | Type | Meaning |
|-------|------------------|------|---------|
| `tenant_id` | always | string | Tenant scope of the promoted version. |
| `project_id` | always | string | Project scope. |
| `model_id` | always | string | Registry model id. |
| `version` | always | **number** (JSON integer) | Numeric model **version** row that was promoted (same as promote request body). |
| `artifact_uri` | always when webhook runs | string | Non-empty URI string from the promoted `model_versions` row (trimmed). If empty, webhook is **not** sent (see table above). |
| `idempotency_key` | **optional** | string or omitted | When non-null, included. When `null`, **omitted** from JSON entirely. Current API builds a stable string: `mlair-promote-<model_id>-v<version>-<stage>`. |

Example body (pretty-printed):

```json
{
  "tenant_id": "default",
  "project_id": "default_project",
  "model_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": 3,
  "artifact_uri": "file:///mlair/artifacts/models/.../weights.bin",
  "idempotency_key": "mlair-promote-550e8400-e29b-41d4-a716-446655440000-v3-production"
}
```

Example with `idempotency_key` omitted (hypothetical future caller passing `None`—your handler should accept bodies **without** this key):

```json
{
  "tenant_id": "default",
  "project_id": "default_project",
  "model_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": 3,
  "artifact_uri": "s3://bucket/key/model.onnx"
}
```

## Semantics on errors (SLA / expectations)

- **Promote in MLAir always completes** if the DB update succeeds. Webhook is **best-effort only**.
- On HTTP error or network failure, MLAir **logs a warning** and returns the normal promote response to the client. There is **no automatic retry** inside MLAir.
- Downstream should treat the webhook as **at-most-once delivery**: implement an **idempotent** handler (keyed by `idempotency_key` and/or `model_id` + `version`), enforce your own **timeout** budget, and optionally **retry** on the downstream side if you need stronger delivery guarantees.

## Downstream checklist

1. Validate `Authorization: Bearer …` against your configured secret (must match `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN`).
2. Return `2xx` quickly if possible; long work should be queued asynchronously.
3. Accept missing `idempotency_key` for forward compatibility.

## Configure MLAir

See [Promote a model](./promote-model.md) and [Consume MLAir from Compose (decoupled)](./consume-mlair-from-compose.md) for env placement (`MLAIR_MODEL_PROMOTE_*`).

## Done

You can implement a small HTTP receiver with the schema above without coupling to any specific upstream product name.
