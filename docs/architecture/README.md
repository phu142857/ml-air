# Architecture Overview

MLAir is an enterprise **MLOps governance platform**: it coordinates Models, Datasets, Pipelines, Scheduler/Workers, Registry, and Hub surfaces while preserving accountability, resource history, and tenant/project scope.

This document describes the **current** internal architecture for contributors and deployers. It is not an OpenAPI reference.

## Domain Events

| Capability | Default | Opt-in |
|------------|---------|--------|
| In-process bus | Yes | — |
| Domain Audit + API | Yes | — |
| Timeline from audit metadata | Yes | — |
| Durable outbox | No | `ML_AIR_DOMAIN_EVENT_OUTBOX=1` |
| Outbox replay API | When outbox on | — |
| Domain webhook HTTP | No | `ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1` |
| Handler timeouts / metrics / OTEL | Yes | tune via env |

Aggregates emit Domain Events; services publish **after** persist. Default path is **`InProcessEventBus`** (synchronous handlers, same DB connection for Audit).

Operational detail: [Domain Events](./domain-events.md).

## Design principles

| Principle | Meaning in MLAir |
|-----------|------------------|
| Aggregate owns business rules | Lifecycle mutations emit **Domain Events** from aggregate methods |
| Domain Events for side effects | Audit, metrics, and domain webhooks subscribe — services do not write those stores directly |
| Audit ≠ Timeline | **Audit** answers *who did what?* **Timeline** answers *what happened to this resource?* |
| Projections are disposable | Timeline can be rebuilt from Domain Audit (+ other sources) |
| Transport is swappable | `DomainEventPublisher` + in-process or outbox bus |

## High-level layout

```text
HTTP / Hub
    │
    ▼
Application services (persist aggregate state)
    │  pull_events() → publish via DomainEventPublisher
    ▼
Event bus (InProcessEventBus default; PostgresOutboxEventBus optional)
    │
    ├── AuditEventHandler      → domain_audit_events
    ├── MetricsEventHandler    → Prometheus lifecycle counters
    └── WebhookEventHandler    → draft → HTTP when domain webhook delivery on

Timeline API (read projection)
    └── readiness rows + domain_audit_events + run/task snapshots
         (model-version kinds: metadata only — no live model_versions JOIN)
```

## Domain packages

| Package | Role |
|---------|------|
| `app.domains.shared.events` | Contracts, envelope, publisher, buses, dispatch hardening |
| `app.domains.governance` | Model registry / ModelVersion aggregate |
| `app.domains.lifecycle` | Datasets, readiness, lineage |
| `app.domains.orchestration` | Runs, pipelines; webhook/metrics handlers |
| `app.domains.audit` | Domain audit persistence and query API |
| `app.domains.observability` | Timeline projection, semantic realtime outbox |

## Two event systems (do not confuse them)

| System | Purpose | Entry point |
|--------|---------|-------------|
| **Domain Events** | Accountability: audit, metrics, domain webhooks | Aggregates + `get_event_bus()` |
| **Semantic realtime** | Hub Pub/Sub, semantic outbox, semantic webhook subscriptions | `realtime_events.publish_mlair_event` |

See [Event Processing](./event-processing.md) and [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).

## Related docs

- [Control Plane configuration contract](./control-plane.md) — scoped configuration, provenance, resolver boundary (Step 3 / P0 source of truth)
- [Event Processing](./event-processing.md)
- [Domain Events](./domain-events.md)
- [Developer Guide](./developer-guide.md)
- [Production deployment](../runbooks/production-deployment.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — full platform topology
