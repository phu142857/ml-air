# Realtime event envelope (v1)

MLAir publishes UI realtime events to Redis channel **`mlair.events.{tenant_id}.{project_id}`** (see [Runbook: Realtime / WebSocket service](../runbooks/realtime-service.md)). The fan-out service forwards them to WebSocket clients; the browser hook maps `type` → React Query invalidation ([`frontend/lib/use-mlair-realtime.ts`](../../frontend/lib/use-mlair-realtime.ts)). **Architecture:** [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) (Mermaid: outbox, Redis, webhooks, replay).

## Envelope (all events)

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | `"v1"` today |
| `event_id` | yes | UUID; clients may dedupe on this |
| `type` | yes | Semantic type string (see below) |
| `tenant_id` | yes | Scope |
| `project_id` | yes | Scope |
| `resource_id` | often | Primary subject id when the event is about a single row (run, dataset, model, …); may be `null` |
| `timestamp` | yes | Unix epoch seconds (float) |
| `trace_id` | optional | Correlates with API logs when set |
| `payload` | yes | Type-specific object (may be empty `{}`) |

`dataset_version_id`, `policy_id`, `model_id`, and `run_id` are **not** top-level envelope fields; when present they appear under **`payload`** (see matrix). This keeps the envelope small while allowing lifecycle-heavy payloads.

## Payload matrix (selected semantic types)

| `type` | Typical `resource_id` | `payload` (keys commonly present) |
| --- | --- | --- |
| `dataset.version.created` | `dataset_id` | `dataset_id`, `version_id`, `record_count`, `updated_at`, … |
| `dataset.readiness.updated` | `dataset_id` | `required_size`, `current_size`, `status`, `updated_at`, optional `source` |
| `dataset.buffer.updated` | `dataset_id` | buffer fields + `updated_at` |
| `buffer.threshold_met` | `dataset_id` | `dataset_id`, `current_size`, `target_threshold`, `accumulation_strategy`, `updated_at`, … |
| `training.triggered` | `run_id` | `run_id`, `model_id`, `dataset_id`, `dataset_version_id`, `pipeline_id`, `blocked_by_gate`, `updated_at` |
| `training.completed` | `run_id` | `run_id`, `pipeline_id`, `dataset_version_id`, optional `model_id` / `dataset_id`, `status`, `updated_at` |
| `training.eligibility.updated` | `run_id` | `run_id`, `dataset_id`, `status`, `ready`, `updated_at` |
| `eligibility.updated` | `run_id` or `model_id` | Same as training/model eligibility plus **`kind`**: `training` \| `model` |
| `model.promoted` | `model_id` | `model_id`, `version`, `stage`, `updated_at`, … |
| `model.eligibility.updated` | `model_id` | `model_id`, `action`, `updated_at`, optional `version`, `stage`, `approval_status` |
| `run.created` / `run.updated` | `run_id` | `status`, `updated_at`, … |
| `task.updated` | `task_id` | `run_id`, `status`, `updated_at`, … |

Aliases and additional types are defined in [`api/app/services/realtime_events.py`](../../api/app/services/realtime_events.py) (`EventType`).

## Consumers

- **Web UI:** `NEXT_PUBLIC_MLAIR_REALTIME_WS` + `useMlairRealtime` (debounced invalidation).
- **Automation:** subscribe to the Redis channel or extend the audit export path ([`GET .../audit/timeline/export`](./overview.md)) for persisted history.

## Durable outbox (optional)

When **`ML_AIR_EVENT_OUTBOX=1`**, the API appends each semantic envelope to Postgres table **`semantic_event_outbox`** before attempting Redis publish, and sets **`redis_delivered_at`** after a successful publish. Failed Redis attempts leave the row undelivered for a background drain (enable with **`ML_AIR_EVENT_OUTBOX_DRAIN_INTERVAL_SEC`** > 0 on the API process — advisory-locked batch republish). This is **not** a full transactional outbox across business writes + events; it is an **at-least-once delivery log + retry** for the realtime channel. See [`event_outbox_service.py`](../../api/app/services/event_outbox_service.py).

### Outbox listing and manual replay (operator)

After migration **`0025_evt_outbox`**, project-scoped APIs (same auth as audit timeline):

- **`GET /v1/tenants/{tenant_id}/projects/{project_id}/semantic-events/outbox`** — **viewer**; optional query `event_type`, `delivered` (`yes` \| `no`), `limit`/`offset`. Returns **`items`** with `outbox_id`, `event_type`, full **`envelope`**, `created_at`, `redis_delivered_at`.
- **`POST /v1/tenants/{tenant_id}/projects/{project_id}/semantic-events/outbox/replay`** — **maintainer**; JSON body `{ "outbox_ids": ["<uuid>", ...], "mark_delivered": true }` (up to **50** ids). Re-publishes each stored envelope to the Redis channel (same **`event_id`** as when first written). Response **`results`** per id: `redis_published`, optional `detail` (`not_found`, `redis_publish_failed`, `outbox_unavailable`). Manual replay can duplicate deliveries for subscribers that do not dedupe on **`event_id`**.

## Webhook subscriptions (optional)

When **`ML_AIR_SEMANTIC_WEBHOOK_DELIVERY=1`**, each valid semantic publish also **fans out** (best-effort, background thread) to registered HTTP targets for that tenant/project. The POST body is the same JSON envelope as Redis. Registration and delivery use a non-empty deployment allowlist **`ML_AIR_WEBHOOK_ALLOWED_HOSTS`** (comma-separated hostnames; case-insensitive exact match to the URL host). **`POST .../webhooks/subscriptions`** is rejected if the allowlist is unset — configure hosts before registering URLs. Optional per-subscription **`secret_hmac`** adds **`X-MLAir-Signature-256: sha256=<hex>`** (HMAC-SHA256 over the raw JSON body bytes). Migration **`0026_webhook_subscriptions`** — table **`semantic_webhook_subscriptions`**. APIs (see [`semantic_webhook_subscription_service.py`](../../api/app/services/semantic_webhook_subscription_service.py)):

- **`GET /v1/tenants/{tenant_id}/projects/{project_id}/webhooks/subscriptions`** — **viewer**; returns **`items`** (`subscription_id`, `target_url`, `secret_hmac_configured`, `event_types` or all-types, `enabled`, timestamps). Secrets are never returned.
- **`POST .../webhooks/subscriptions`** — **maintainer**; body `{ "target_url", "secret_hmac"?, "event_types"?, "enabled"? }`. Omit **`event_types`** or use an empty list to receive **all** semantic types.
- **`DELETE .../webhooks/subscriptions/{subscription_id}`** — **maintainer**.

**Retry:** Outbound POSTs use **`ML_AIR_SEMANTIC_WEBHOOK_MAX_ATTEMPTS`** (default **3**, clamped 1–8) and exponential backoff from **`ML_AIR_SEMANTIC_WEBHOOK_RETRY_BACKOFF_MS`** (default **250** ms, capped at 5 s between attempts). Retries apply to transport errors and HTTP **408**, **425**, **429**, and **5xx**; **4xx** (except those listed) are not retried.

**Downstream idempotency headers:** Each attempt sends **`X-MLAir-Event-Id`** (same as envelope **`event_id`**, when present) and **`X-MLAir-Delivery-Attempt`** (`1` … `N`). Receivers should treat **`event_id`** as an idempotency key.

**Optional delivery dedupe:** **`ML_AIR_SEMANTIC_WEBHOOK_DEDUPE=1`** with migration **`0027_webhook_delivery_ack`** records a row after the **first successful** POST per **`(event_id, subscription_id)`**; later publishes with the same pair skip HTTP for that subscription (useful when the same semantic event is emitted twice). Turn **off** if you intentionally need duplicate HTTP deliveries for the same `event_id`.

**Operator cookbook:** step-by-step registration, curl examples, and signature verification — [Semantic event webhook cookbook](../guides/semantic-webhook-cookbook.md).
