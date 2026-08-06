# Domain Events (transport and operations)

Reference for contributors and operators extending MLAir's Domain Event stack.

## Overview

| Layer | Responsibility |
|-------|----------------|
| Aggregates | Emit immutable `DomainEvent` facts via `_emit` / `pull_events()` |
| Application services | Persist state, then `get_event_bus().publish_all(..., session=conn)` |
| Event bus | `InProcessEventBus` (default) or `PostgresOutboxEventBus` (opt-in) |
| Handlers | Audit, Metrics, Webhook — subscribe only; never publish business events |

See also: [Event Flow](./event-flow.md), [Audit Flow](./audit-flow.md), [Timeline Flow](./timeline-flow.md).

## Default vs durable transport

**Default (`ML_AIR_DOMAIN_EVENT_OUTBOX=0`):** synchronous `InProcessEventBus`. Handlers run in the same DB connection as the business write (Audit shares the transaction).

**Durable outbox (`ML_AIR_DOMAIN_EVENT_OUTBOX=1`):** envelopes persist to `domain_event_outbox` (migration **0050**); a background drain dispatches handlers. Requires migrations **0050–0052**.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ML_AIR_DOMAIN_EVENT_OUTBOX` | `0` | Enable durable enqueue |
| `ML_AIR_DOMAIN_EVENT_OUTBOX_DRAIN_INTERVAL_SEC` | `5` | Drain loop interval (`0` = disabled) |
| `ML_AIR_DOMAIN_EVENT_OUTBOX_MAX_ATTEMPTS` | `5` | Attempts before DLQ |
| `ML_AIR_DOMAIN_EVENT_OUTBOX_BATCH_SIZE` | `25` | Rows per drain batch |

## Actor and request context

HTTP middleware and `authenticate_bearer` bind `ActorRef`, `request_id`, correlation, IP, and User-Agent into `build_event_context()`. Domain Audit stores `request_id` in event metadata.

## Outbox replay API

Maintainer role on tenant/project.

```http
GET  /v1/tenants/{tenant}/projects/{project}/domain-events/outbox
POST /v1/tenants/{tenant}/projects/{project}/domain-events/outbox/replay
```

Replay body: `{ "outbox_ids": ["<uuid>", ...], "mark_delivered": true }` (max 50 ids).

Query filters: `event_type`, `delivered` (`yes` | `no` | `dlq` | `any`).

### Idempotency on replay

| Handler | Mechanism |
|---------|-----------|
| Domain Audit | `domain_audit_events.source_domain_event_id` UNIQUE |
| Metrics / Webhook | `domain_event_handler_acks` (event_id + handler_name) |

## Domain webhook delivery

Enable with `ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1`. Targets must be on the platform webhook host allowlist (same policy as semantic webhooks).

| Variable | Default | Purpose |
|----------|---------|---------|
| `ML_AIR_DOMAIN_WEBHOOK_DELIVERY` | `0` | HTTP POST on Domain Event lifecycle |
| `ML_AIR_DOMAIN_WEBHOOK_DEDUPE` | `1` | Skip duplicate (event_id, subscription) pairs |
| `ML_AIR_DOMAIN_WEBHOOK_MAX_ATTEMPTS` | `3` | Delivery retries |
| `ML_AIR_DOMAIN_WEBHOOK_TIMEOUT_SECONDS` | `10` | HTTP timeout |

Subscriptions (migration **0052**):

```http
GET    /v1/tenants/{tenant}/projects/{project}/domain-webhooks/subscriptions
POST   /v1/tenants/{tenant}/projects/{project}/domain-webhooks/subscriptions
DELETE /v1/tenants/{tenant}/projects/{project}/domain-webhooks/subscriptions/{id}
```

Outbound JSON includes `event_id`, `action`, `target_type`, `target_id`, `metadata`, and actor fields. HMAC header: `X-MLAir-Signature-256` when subscription secret is set.

For Hub UI / semantic realtime webhooks, use [Semantic webhook cookbook](../guides/semantic-webhook-cookbook.md) — a separate system from Domain Event webhooks.

## Production hardening

| Feature | Env / metric |
|---------|----------------|
| Handler timeout | `ML_AIR_DOMAIN_EVENT_HANDLER_TIMEOUT_SEC` (default `30`) |
| Dispatch counters | `mlair_domain_event_dispatch_total` |
| Handler errors | `mlair_domain_event_handler_errors_total` |
| Latency | `mlair_domain_event_dispatch_duration_seconds` |
| Tracing | OTEL span `domain_event.dispatch` when `ML_AIR_OTEL_ENABLED=1` |

## Aggregates and events

| Aggregate | Events |
|-----------|--------|
| ModelVersion | Created, Approved, Rejected, Promoted, Rollback, Deleted |
| Dataset | Created, Deleted |
| Pipeline | `PipelineVersionCreated` |
| Run | Created, Started, Completed, Failed, Cancelled |
| Readiness | `ReadinessEvaluated` |

## Migrations

| Revision | Table / change |
|----------|----------------|
| `0049_domain_audit_events` | Domain Audit store |
| `0050_domain_event_outbox` | Durable outbox |
| `0051_domain_audit_source_event` | Replay idempotency + handler acks |
| `0052_domain_webhook_subscriptions` | Domain webhook CRUD + dedupe acks |

## Tests

```bash
PYTHONPATH=api python -m pytest \
  api/tests/test_domain_event_foundation.py \
  api/tests/test_event_context_actor_propagation.py \
  api/tests/test_run_aggregate_domain_events.py \
  api/tests/test_readiness_aggregate_domain_events.py \
  api/tests/test_domain_event_outbox.py \
  api/tests/test_domain_audit_repository.py \
  api/tests/test_metrics_exactly_once.py
```
