# Lifecycle semantic event flow

This page diagrams how **v1 semantic envelopes** move from the API to consumers: **Redis Pub/Sub** (UI realtime), optional **Postgres outbox**, optional **HTTP webhooks**, and **manual replay**.

**Contract:** [Realtime event envelope (v1)](../api/realtime-event-envelope.md).

## Publish path (API)

When application code calls `publish_mlair_event` ([`realtime_events.py`](../../api/app/services/realtime_events.py)), the API performs the following in one call (simplified).

```mermaid
flowchart TD
  A[publish_mlair_event] --> B{outbox enabled?}
  B -->|yes| C[INSERT semantic_event_outbox]
  B -->|no| D[skip outbox insert]
  C --> D
  D --> E{valid tenant_id, project_id, type?}
  E -->|no| Z[return]
  E -->|yes| F{realtime_enabled?}
  F -->|yes| G[Redis PUBLISH mlair.events.tenant.project]
  F -->|no| H[skip Redis]
  G --> I{Redis OK and outbox on?}
  I -->|yes| J[UPDATE redis_delivered_at]
  I -->|no| K[leave row undelivered]
  J --> L[schedule semantic webhooks thread]
  K --> L
  H --> L
  L --> Z
```

**Notes**

- **Outbox** is best-effort insert; **Redis delivery mark** runs only after a **successful** publish when outbox is enabled.
- **Semantic webhooks** run in a **daemon thread** after validation, regardless of Redis success or failure (so automations can still receive events if Redis is down). Webhook HTTP itself is gated by `ML_AIR_SEMANTIC_WEBHOOK_DELIVERY` inside the worker.

## Optional outbox drain (API background)

When `ML_AIR_EVENT_OUTBOX_DRAIN_INTERVAL_SEC` > 0, a periodic thread republishes undelivered rows to Redis (advisory lock + `FOR UPDATE SKIP LOCKED`). See [Durable outbox](../api/realtime-event-envelope.md#durable-outbox-optional).

```mermaid
flowchart LR
  T[Timer] --> L[advisory lock batch]
  L --> R[Redis PUBLISH per row]
  R --> M[mark redis_delivered_at]
```

## Semantic webhook delivery (worker thread)

Per matching subscription, the worker may **skip** (dedupe), then **POST with retries**, then **record ack** (if dedupe is on).

```mermaid
flowchart TD
  W[Webhook worker] --> A{delivery + allowlist OK?}
  A -->|no| X[exit]
  A -->|yes| B[load enabled subscriptions]
  B --> C{for each subscription}
  C --> D{host allowlisted?}
  D -->|no| C
  D -->|yes| E{type filter match?}
  E -->|no| C
  E -->|yes| F{dedupe on and ack exists?}
  F -->|yes| C
  F -->|no| G[POST with X-MLAir-Event-Id + Attempt]
  G --> H{success?}
  H -->|retry| I{attempts left?}
  I -->|yes| J[backoff sleep]
  J --> G
  I -->|no| C
  H -->|ok| K{dedupe on?}
  K -->|yes| L[INSERT delivery_ack]
  K -->|no| C
  L --> C
```

## Manual replay (operator API)

Maintainers can re-push stored envelopes to **Redis** only (not a second outbox insert). See [Outbox listing and manual replay](../api/realtime-event-envelope.md#outbox-listing-and-manual-replay-operator).

```mermaid
flowchart LR
  U[POST .../semantic-events/outbox/replay] --> DB[(semantic_event_outbox)]
  DB --> R[Redis PUBLISH]
  R --> M[optional mark redis_delivered_at]
```

## UI and external consumers (after Redis)

```mermaid
flowchart LR
  Redis[(Redis channel)] --> Fan[realtime fan-out service]
  Fan --> WS[WebSocket clients]
  WS --> Hub[Hub React Query invalidation]
```

## Related guides

- [Reference: external integration surfaces](../guides/reference-integrations.md) — choose Redis vs webhooks vs audit vs metrics.
- [Semantic event webhook cookbook](../guides/semantic-webhook-cookbook.md) — register HTTP targets and verify signatures.
- [Runbook: Realtime / WebSocket service](../runbooks/realtime-service.md) — operate the fan-out path.
