# Phase 2 Roadmap

Phase 1 (Domain Event foundation) is **released**. Phase 2 epics are **complete**.

## Epic order (risk-optimized)

| Epic | Name | Status |
|------|------|--------|
| **1** | Event Context & Actor Propagation | **Done** |
| **2** | Run Aggregate | **Done** |
| **3** | Readiness Aggregate | **Done** |
| **4** | Outbox Event Bus | **Done** |
| **5** | Replay | **Done** |
| **6** | Webhook Delivery | **Done** |
| **7** | Production Hardening | **Done** |

---

## Epic 4 — Outbox Event Bus

### Goal

Durable Domain Event transport: persist envelopes in the same DB transaction as business writes; dispatch handlers asynchronously.

### Enable

`ML_AIR_DOMAIN_EVENT_OUTBOX=1` (default **off** — in-process bus remains default).

Optional worker: `ML_AIR_DOMAIN_EVENT_OUTBOX_DRAIN_INTERVAL_SEC` (default `5`), `ML_AIR_DOMAIN_EVENT_OUTBOX_MAX_ATTEMPTS`, `ML_AIR_DOMAIN_EVENT_OUTBOX_BATCH_SIZE`.

### Table

`domain_event_outbox` (migration **0050**): `outbox_id` (= envelope `event_id`), `envelope` JSONB, `delivered_at`, `attempt_count`, `dlq_at`.

### Code

| Piece | Location |
|-------|----------|
| Codec | `shared/events/domain_event_codec.py` |
| Registry | `shared/events/domain_event_registry.py` |
| Bus | `shared/events/postgres_outbox_event_bus.py` |
| Drain worker | `shared/events/domain_event_outbox_service.py` |
| Provider | `shared/events/event_bus_provider.py` |

When outbox is off, `get_event_bus()` returns `InProcessEventBus` (Phase 1 behaviour).

---

## Epic 5 — Replay

### Goal

Operators can list and re-dispatch stored Domain Event envelopes (idempotent handlers).

### API

```http
GET /v1/tenants/{tenant}/projects/{project}/domain-events/outbox
POST /v1/tenants/{tenant}/projects/{project}/domain-events/outbox/replay
```

Maintainer role required for replay. Body: `{ "outbox_ids": ["..."], "mark_delivered": true }`.

### Idempotency

- Domain Audit: `domain_audit_events.source_domain_event_id` UNIQUE (migration **0051**)
- Metrics / Webhook: `domain_event_handler_acks` (event_id + handler_name)

---

## Epic 6 — Webhook Delivery

### Goal

Replace `NoopWebhookEventSink` with signed HTTP delivery for Domain Event lifecycle actions.

### Enable

`ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1`, allowlist via platform webhook hosts (same as semantic webhooks).

Optional: `ML_AIR_DOMAIN_WEBHOOK_DEDUPE=1`, `ML_AIR_DOMAIN_WEBHOOK_MAX_ATTEMPTS`, `ML_AIR_DOMAIN_WEBHOOK_TIMEOUT_SECONDS`.

### Subscriptions

Table `domain_webhook_subscriptions` (migration **0052**).

```http
GET|POST|DELETE /v1/tenants/{tenant}/projects/{project}/domain-webhooks/subscriptions
```

Payload shape: `action`, `target_type`, `target_id`, `metadata`, `event_id`, actor fields — see `domain_webhook_subscription_service.py`.

---

## Epic 7 — Production Hardening

| Feature | Env / metric |
|---------|----------------|
| Handler timeout | `ML_AIR_DOMAIN_EVENT_HANDLER_TIMEOUT_SEC` (default 30) |
| Dispatch counters | `mlair_domain_event_dispatch_total` |
| Handler errors | `mlair_domain_event_handler_errors_total` |
| Latency histogram | `mlair_domain_event_dispatch_duration_seconds` |
| Tracing | OpenTelemetry span `domain_event.dispatch` when OTEL enabled |

Implementation: `shared/events/domain_event_dispatch.py`.

---

## Prior epics (summary)

Epics 1–3: actor propagation, Run aggregate, Readiness aggregate — see git history / CHANGELOG.

Tests: `test_event_context_actor_propagation.py`, `test_run_aggregate_domain_events.py`, `test_readiness_aggregate_domain_events.py`, `test_domain_event_outbox.py`.
