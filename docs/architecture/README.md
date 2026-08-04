# Architecture Overview

MLAir is an enterprise **AI Control Plane**: it coordinates Models, Datasets, Pipelines, Scheduler/Workers, Registry, and Hub surfaces while preserving accountability, resource history, and tenant/project scope.

This document describes the **current** internal architecture for contributors and deployers. It is not an OpenAPI reference and not a product roadmap.

## Phase 1 status (Domain Event foundation)

**Release gate: PASS.** Shipped foundation:

- Aggregates emit Domain Events; services publish **after** persist
- Domain Audit store + API (`/v1/audit/events`)
- Timeline projects model-version history from Domain Audit metadata (deletion-safe)
- Metrics ownership via `MetricsEventHandler` (exactly-once for promote/approval)
- `WebhookEventHandler` mapping contracts only (**no outbound HTTP** yet)
- `OutboxEventBus` interface only (`InProcessEventBus` in production)

Accepted Phase 1 debt (not blockers): `ActorRef` often unset (prefer Phase 2), dual Domain vs semantic event systems, Outbox not implemented. See Release Gate notes in the project conversation / changelog.

## Design principles

| Principle | Meaning in MLAir |
|-----------|------------------|
| Aggregate owns business rules | Lifecycle mutations for ModelVersion, Dataset, and Pipeline emit **Domain Events** from the aggregate |
| Domain Events for internal side effects | Audit and metrics subscribe to Domain Events — application services do not write those stores for domain accountability. Outbound Domain webhooks are Phase 2 |
| Audit ≠ Timeline | **Audit** answers *who did what?* **Timeline** answers *what happened to this resource?* |
| Projections are disposable | Timeline (and similar views) can be rebuilt from Domain Audit (+ other sources) without changing aggregates |
| Transport is swappable | Services publish through `DomainEventPublisher`; the default bus is in-process; an `OutboxEventBus` interface exists for a later durable transport |

## High-level layout

```text
HTTP / Hub
    │
    ▼
Application services (persist aggregate state)
    │  pull_events() → publish via DomainEventPublisher
    ▼
Event bus (InProcessEventBus today)
    │
    ├── AuditEventHandler      → domain_audit_events
    ├── MetricsEventHandler    → existing Prometheus counters
    └── WebhookEventHandler    → mapping/contracts only (no outbound HTTP yet)

Timeline API (read projection)
    └── merges readiness rows + domain_audit_events + run/task snapshots
         (model-version kinds: metadata only — no live model_versions JOIN)
```

## Domain packages

| Package | Role |
|---------|------|
| `app.domains.shared.events` | Domain Event contracts, envelope, publisher, in-process bus, aggregate root |
| `app.domains.governance` | Model registry / ModelVersion aggregate |
| `app.domains.lifecycle` | Datasets, readiness, lineage, Dataset aggregate |
| `app.domains.orchestration` | Runs, pipelines, Pipeline aggregate; webhook/metrics event handlers |
| `app.domains.audit` | Domain audit persistence, mapping, query API backing |
| `app.domains.observability` | Timeline projection, semantic realtime outbox (separate from Domain Event bus) |

## Two event systems (do not confuse them)

| System | Purpose | Entry point |
|--------|---------|-------------|
| **Domain Events** | Internal business facts for audit / metrics / (future) domain webhooks | Aggregates + `get_event_bus()` |
| **Semantic realtime envelopes** | Hub UI Pub/Sub, optional Postgres outbox, semantic webhook subscriptions | `realtime_events.publish_mlair_event` |

Semantic realtime remains the fan-out path for UI and existing webhook subscriptions. Domain Events are the accountability/projection path for ModelVersion / Dataset / Pipeline lifecycle. See [Event Flow](./event-flow.md) and [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).

## Related docs

- [Event Flow](./event-flow.md)
- [Audit Flow](./audit-flow.md)
- [Timeline Flow](./timeline-flow.md)
- [Developer Guide](./developer-guide.md)
- Deploy: [Production deployment](../runbooks/production-deployment.md)
- Production baseline topology: [ARCHITECTURE.md](../../ARCHITECTURE.md)
