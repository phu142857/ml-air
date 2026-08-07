# Event Processing

How MLAir processes Domain Events from aggregates through audit, projections, metrics, webhooks, and replay. For transport configuration and operator APIs, see [Domain Events](./domain-events.md).

## Domain Events

Domain Events are immutable business facts emitted by aggregates after state changes. Application services persist aggregate state, then publish via `get_event_bus()` — they never write audit, timeline, or projection stores directly.

### Contracts

| Type | Module | Responsibility |
|------|--------|----------------|
| `DomainEvent` | `shared/events/domain_event.py` | Immutable business fact (no actor/IP/transport) |
| `EventContext` | `shared/events/context.py` | Request metadata: tenant, project, actor, correlation, IP, UA |
| `EventEnvelope` | `shared/events/envelope.py` | Bus wrapper: `event_id`, `event_version`, `occurred_at`, event, context |
| `DomainEventPublisher` | `shared/events/publisher.py` | Application port: `publish` / `publish_all` |
| `DomainEventHandler` | `shared/events/handler.py` | Subscriber: `handle(envelope, *, session)` |
| `AggregateRoot` | `shared/events/aggregate_root.py` | Internal `_events` + `pull_events()` |
| `InProcessEventBus` | `shared/events/inprocess_event_bus.py` | Default: sync dispatch on same `session` |
| `OutboxEventBus` | `shared/events/postgres_outbox_event_bus.py` | Opt-in durable enqueue |

Obtain the bus with `get_event_bus()` (`event_bus_provider.py`).

### Runtime path (in-process)

```text
1. Load or construct AggregateRoot subclass
2. Invoke business method (emits DomainEvent)
3. Persist aggregate state (SQL)
4. events = aggregate.pull_events()
5. get_event_bus().publish_all(events, context=build_event_context(...), session=conn)
6. Bus wraps each event in EventEnvelope
7. Subscribed DomainEventHandler.handle(envelope, session=conn)
```

`build_event_context` reads actor (from `authenticate_bearer`), `request_id`, correlation, IP, and User-Agent from HTTP middleware.

Handlers that write to Postgres (Domain Audit) should use the **same** `session`/`conn` so failures roll back with the business write when transactional.

### Aggregates

| Aggregate | Module | Events |
|-----------|--------|--------|
| `ModelVersionAggregate` | `governance/model_version_aggregate.py` | Created, Approved, Rejected, Promoted, Rollback, Deleted |
| `DatasetAggregate` | `lifecycle/dataset_aggregate.py` | Created, Deleted |
| `PipelineAggregate` | `orchestration/pipeline_aggregate.py` | `PipelineVersionCreated` |
| `RunAggregate` | `orchestration/run_aggregate.py` | Created, Started, Completed, Failed, Cancelled |
| `ReadinessAggregate` | `lifecycle/readiness_aggregate.py` | `ReadinessEvaluated` |

Publish sites: `model_registry_service`, `lineage_service`, `readiness_service`, `pipeline_version_service`, `run_service`, scheduler run transitions.

### Subscribers (API startup)

| Subscriber | Module | Behavior |
|------------|--------|----------|
| Domain Audit | `audit/domain_audit_subscriber.py` | Inserts `domain_audit_events` |
| Webhook | `orchestration/webhook_event_subscriber.py` | HTTP when `ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1` |
| Metrics | `orchestration/metrics_event_subscriber.py` | Lifecycle Prometheus counters |
| Projections | `projections/projection_subscriber.py` | Timeline, Activity, Dashboard, Statistics, Analytics (`ML_AIR_PROJECTIONS_ENABLED`) |
| Notification | `projections/notification_subscriber.py` | Outbound webhook (`ML_AIR_NOTIFICATION_DELIVERY`) |
| Integration | `projections/integration_subscriber.py` | ERP/CRM/CI HTTP (`ML_AIR_INTEGRATION_DELIVERY`) |
| Retention | `governance/event_retention_service.py` | Purge audit/outbox/projections (`ML_AIR_EVENT_RETENTION_ENABLED`) |
| SIEM export | `audit/siem_export_service.py` | Push audit JSONL to external sinks (`ML_AIR_SIEM_EXPORT_ENABLED`) |

Dispatch uses shared hardening (timeout, metrics, OTEL): `domain_event_dispatch.py`.

### Invariants

1. Only aggregates emit Domain Events.
2. Application services **publish** only; no direct Audit/Timeline/projection writes.
3. Handlers must not publish business Domain Events.
4. Extend handlers for new side effects — not Service → HTTP clients.
5. Event payloads stay transport-free; actor lives in `EventContext`.

### Two event systems (do not confuse them)

| System | Purpose | Entry point |
|--------|---------|-------------|
| **Domain Events** | Accountability: audit, metrics, domain webhooks, projections | Aggregates + `get_event_bus()` |
| **Semantic realtime** | Hub Pub/Sub, semantic outbox, semantic webhook subscriptions | `realtime_events.publish_mlair_event` |

Semantic realtime uses a separate **`semantic_event_outbox`** — see [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).

## Outbox

**Default (`ML_AIR_DOMAIN_EVENT_OUTBOX=0`):** synchronous `InProcessEventBus`. Handlers run in the same DB connection as the business write (Audit shares the transaction).

**Durable outbox (`ML_AIR_DOMAIN_EVENT_OUTBOX=1`):** envelopes persist to `domain_event_outbox` (migration **0050**); a background drain dispatches handlers. Requires migrations **0050–0052**.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ML_AIR_DOMAIN_EVENT_OUTBOX` | `0` | Enable durable enqueue |
| `ML_AIR_DOMAIN_EVENT_OUTBOX_DRAIN_INTERVAL_SEC` | `5` | Drain loop interval (`0` = disabled) |
| `ML_AIR_DOMAIN_EVENT_OUTBOX_MAX_ATTEMPTS` | `5` | Attempts before DLQ |
| `ML_AIR_DOMAIN_EVENT_OUTBOX_BATCH_SIZE` | `25` | Rows per drain batch |

On API startup (`app/main.py`), MLAir registers domain audit subscriptions, webhook/metrics handlers, and optional outbox drain when outbox is enabled.

## Audit

Domain Audit records **accountability**: who (actor) did which **action** on which **target**, within tenant/project scope.

It is separate from Identity audit (`identity_audit_events`) and from the Hub Timeline projection.

### Storage

Migration: `api/alembic/versions/0049_domain_audit_events.py`

Table: `domain_audit_events`

| Column | Role |
|--------|------|
| `id` | Event id |
| `occurred_at` | Server timestamp |
| `tenant_id`, `project_id` | Scope |
| `actor_kind`, `actor_id`, `actor_name` | Actor |
| `action` | Stable action string (e.g. `model_version.promoted`) |
| `target_type`, `target_id` | Resource pointer |
| `ip`, `user_agent`, `correlation_id` | Request context |
| `metadata` | JSONB payload from the Domain Event |
| `source_domain_event_id` | Idempotency key for outbox replay (optional) |

### Write path

```text
DomainEvent published (in-process or via outbox drain)
    → AuditEventHandler
        → AuditEventMapper.map(envelope) → row dict (+ source_domain_event_id)
        → DomainAuditRepository.insert_event(session=..., row=...)
        → INSERT domain_audit_events
```

| Component | Module |
|-----------|--------|
| Handler | `app/domains/audit/audit_event_handler.py` |
| Mapper | `app/domains/audit/audit_event_mapper.py` |
| Repository (write) | `app/domains/audit/domain_audit_repository.py` |
| Subscribe | `app/domains/audit/domain_audit_subscriber.py` |

### Subscribed Domain Events

- ModelVersion: created, approved, rejected, promoted, rollback, deleted
- Dataset: created, deleted
- Pipeline: `PipelineVersionCreated`
- Run: created, started, completed, failed, cancelled
- Readiness: `ReadinessEvaluated`

### Example action strings

- `model_version.created` / `.approved` / `.rejected` / `.promoted` / `.rollback` / `.deleted`
- `dataset.created` / `dataset.deleted`
- `pipeline_version.created`

### Read API

Routes: `app/api/routes/audit_events_routes.py` (mounted under `/v1`)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/audit/events` | Requires `tenant` and `project` query params; viewer scope |
| `GET` | `/v1/audit/events/{id}` | Loads row, then authorize on its tenant/project |

List filters: `tenant`, `project`, `actor`, `action`, `target_type`, `target_id`, `date` (occurred_at ≥), plus cursor pagination (`limit`, `offset`, `cursor`).

Query implementation: `app/domains/audit/domain_audit_query_repository.py`.

Public response DTOs use `tenant` / `project` / nested `actor` — not raw DB column names (`DomainAuditEventOut`).

### What not to do

- Do not insert into `domain_audit_events` from application services.
- Do not extend Identity audit for Hub domain lifecycle — use Domain Audit.
- Do not treat Timeline as the system of record for accountability.

## Timeline

Timeline is a **read-only projection**: a merged, ordered feed of what happened to resources in a tenant/project. It is not the write path for Domain Events and is not Domain Audit storage.

### API

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/audit/timeline`
- Export: `GET .../audit/timeline/export`

Implementation: `app/domains/observability/audit_timeline_service.py`

Ordering: `ts DESC`, then `kind DESC`, then `resource_id DESC` (keyset cursor uses the same tuple).

### Sources consumed today

The SQL `WITH timeline AS (...)` union includes:

| Source | Kind examples | Notes |
|--------|---------------|-------|
| `dataset_readiness_evaluations` | `dataset.readiness.evaluated` | Readiness history |
| `domain_audit_events` | `model.version.created`, `model.version.approval_updated`, `model.version.stage_updated`, `model.version.deleted`, `dataset.created`, `dataset.deleted`, `pipeline.version.created` | Mapped from Domain Audit metadata only (no live `model_versions` JOIN) |
| `runs` / `tasks` | `run.created`, `run.updated`, `task.created`, `task.updated` | Snapshot-based (not full transition history) |
| `model_serving_slots` | `model.serving_slot.updated` | Serving slot updates |

Model version create / approval / stage rows are projected from **Domain Audit**, not from direct `model_versions` timestamp scans.

### In-memory adapter

`app/domains/observability/timeline_adapter.py` exposes `merge_timeline_items(*sources)` for tests and pure merges: dedupe by `(ts, kind, resource_id)`, sort same as SQL.

### Relationship to Domain Audit

```text
Write: Aggregate → Domain Event → AuditEventHandler → domain_audit_events
Read:  Timeline query → SQL projection (includes domain_audit_events + readiness + runs/tasks)
```

- Domain Audit is the accountability store.
- Timeline **consumes** audit (and other tables) for resource history UX.
- Replacing or rebuilding the timeline projection must not require changing aggregates.

### Contributor rules

1. Do not write timeline rows from application services.
2. Prefer mapping new Domain Audit actions into the timeline union when Hub should show them.
3. Keep kind strings stable for API consumers; document new kinds when added.
4. Avoid projecting the same business fact from both Domain Audit and a second table under different kinds.

## Metrics

`MetricsEventHandler` subscribes to Domain Events and increments Prometheus lifecycle counters. Dispatch is exactly-once per handler via `domain_event_handler_acks` (event_id + handler_name).

| Feature | Env / metric |
|---------|----------------|
| Handler timeout | `ML_AIR_DOMAIN_EVENT_HANDLER_TIMEOUT_SEC` (default `30`) |
| Dispatch counters | `mlair_domain_event_dispatch_total` |
| Handler errors | `mlair_domain_event_handler_errors_total` |
| Latency | `mlair_domain_event_dispatch_duration_seconds` |
| Tracing | OTEL span `domain_event.dispatch` when `ML_AIR_OTEL_ENABLED=1` |

Module: `app/domains/orchestration/metrics_event_handler.py`, registered in `metrics_event_subscriber.py`.

## Webhooks

### Domain lifecycle webhooks

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

Module: `app/domains/orchestration/webhook_event_handler.py`.

### Semantic realtime webhooks

For Hub UI / semantic realtime webhooks, use [Semantic webhook cookbook](../guides/semantic-webhook-cookbook.md) — a separate system from Domain Event webhooks.

### Notifications and integrations

When projection flags are enabled:

- **Notifications** (`ML_AIR_NOTIFICATION_DELIVERY=1`): Slack/Discord/Teams via incoming webhook URLs — `notification_subscriber.py`, API `.../notifications/channels`
- **Integrations** (`ML_AIR_INTEGRATION_DELIVERY=1`): HTTP POST to ERP/CRM/CI/CD endpoints — `integration_subscriber.py`, API `.../integrations/subscriptions`

## Replay

### Outbox replay API

Maintainer role on tenant/project. Requires durable outbox (`ML_AIR_DOMAIN_EVENT_OUTBOX=1`).

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
| Projections | `source_domain_event_id` UNIQUE per projection store + handler ack |

For operator guidance on lineage/run replay (separate from Domain Event outbox), see [Replay guide](../guides/replay.md).

## CQRS Read Models

Domain Events feed optional **projection handlers** that materialize read models for Hub and external integrators. Application services never write projection tables directly.

### Framework

| Component | Role |
|-----------|------|
| `ProjectionHandler` | Contract: write read model from `EventEnvelope` |
| `ProjectionRegistry` | Map event type → handlers |
| `ProjectionRunner` | Fan-out + idempotency (`projection:{name}` ack) |
| `ProjectionCheckpoint` | Lag / health per scope |
| `ProjectionRebuilder` | Replay from `domain_audit_events` |
| `ProjectionHealth` | `GET .../projections/health` |

Module: `api/app/domains/projections/framework/`

### Projection stores

| Store | Table | Projector |
|-------|-------|-----------|
| Timeline | `projected_timeline_events` | `TimelineProjection` |
| Activity | `projected_activity_events` | `ActivityProjection` |
| Dashboard | `projected_dashboard_snapshots` | `DashboardProjection` |
| Statistics | `projected_statistics_daily` | `StatisticsProjection` |
| Analytics | `projected_analytics_rollups` | `AnalyticsProjection` |

Migration: `0053_projection_stores`

### Feature flags

| Env | Default | Purpose |
|-----|---------|---------|
| `ML_AIR_PROJECTIONS_ENABLED` | `0` | Enable write path (projectors) |
| `ML_AIR_TIMELINE_PROJECTION_READS` | `0` | Timeline API reads `projected_timeline_events` |
| `ML_AIR_DASHBOARD_PROJECTION_READS` | `0` | Dashboard reads snapshot projection |
| `ML_AIR_NOTIFICATION_DELIVERY` | `0` | Send notification outbound |
| `ML_AIR_INTEGRATION_DELIVERY` | `0` | Send integration outbound |

Expose via `GET /v1/runtime-config` → `features.*`.

### Projection APIs

| Method | Path | Role |
|--------|------|------|
| GET | `.../projections/activity` | Activity feed |
| GET | `.../projections/dashboard` | Dashboard snapshot |
| GET | `.../projections/analytics` | Analytics rollups |
| GET | `.../projections/health` | Projection lag |
| POST | `.../projections/rebuild` | Maintainer replay |

### Invariants

1. Application services do not write projection tables directly.
2. Only projection handlers (and rebuilder) write read models.
3. Handlers do not publish business Domain Events.
4. Idempotency: `source_domain_event_id UNIQUE` + handler ack.

## Further reading

- [Domain Events](./domain-events.md) — transport, env vars, migrations
- [Developer Guide](./developer-guide.md) — deploy, extend, test
- [Architecture Overview](./README.md)
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — Hub Pub/Sub (separate system)
