# Event Flow

How Domain Events move from aggregates to subscribers in the **current** codebase.

## Contracts

| Type | Module | Responsibility |
|------|--------|----------------|
| `DomainEvent` | `shared/events/domain_event.py` | Immutable business fact (no actor/IP/transport) |
| `EventContext` | `shared/events/context.py` | Request metadata: tenant, project, actor, correlation, IP, UA |
| `EventEnvelope` | `shared/events/envelope.py` | Bus-created wrapper: `event_id`, `event_version`, `occurred_at`, event, context |
| `DomainEventPublisher` | `shared/events/publisher.py` | Application port: `publish` / `publish_all` |
| `DomainEventHandler` | `shared/events/handler.py` | Subscriber: `handle(envelope, *, session)` |
| `AggregateRoot` | `shared/events/aggregate_root.py` | Internal `_events` list + `pull_events()` |
| `InProcessEventBus` | `shared/events/inprocess_event_bus.py` | Default bus: sync dispatch on the same `session` |
| `OutboxEventBus` | `shared/events/postgres_outbox_event_bus.py` | Opt-in durable enqueue (`ML_AIR_DOMAIN_EVENT_OUTBOX=1`) |

Obtain the bus with `get_event_bus()` (`shared/events/event_bus_provider.py`). Callers depend on `DomainEventPublisher`, not a concrete bus type.

## Runtime path

```text
1. Load or construct AggregateRoot subclass
2. Invoke business method (emits DomainEvent into aggregate._events)
3. Persist aggregate state (SQL)
4. events = aggregate.pull_events()
5. get_event_bus().publish_all(events, context=build_event_context(...), session=conn)
6. InProcessEventBus wraps each event in EventEnvelope
7. Each subscribed DomainEventHandler.handle(envelope, session=conn) runs
```

`build_event_context` reads request-scoped bindings: actor (from `authenticate_bearer`),
`request_id` / correlation / IP / User-Agent (from HTTP middleware). See [Phase 2 Epic 1](./phase-2.md).

Handlers that write to Postgres (for example Domain Audit) must use the **same** `session`/`conn` so failures roll back with the business write when the connection is transactional.

## Aggregates that emit today

| Aggregate | Module | Events |
|-----------|--------|--------|
| `ModelVersionAggregate` | `governance/model_version_aggregate.py` | Created, Approved, Rejected, Promoted, Rollback, Deleted |
| `DatasetAggregate` | `lifecycle/dataset_aggregate.py` | Created, Deleted |
| `PipelineAggregate` | `orchestration/pipeline_aggregate.py` | `PipelineVersionCreated` |
| `RunAggregate` | `orchestration/run_aggregate.py` | Created, Started, Completed, Failed, Cancelled |
| `ReadinessAggregate` | `lifecycle/readiness_aggregate.py` | `ReadinessEvaluated` |

Application services that publish after persistence include:

- `governance/model_registry_service.py` (create / promote / approval / delete version)
- `lifecycle/lineage_service.py` (dataset create / delete paths)
- `lifecycle/readiness_service.py` (readiness evaluation INSERT)
- `orchestration/pipeline_version_service.py` (create pipeline version)
- `orchestration/run_service.py` + scheduler `_transition_run_status` (run lifecycle)

## Subscribers registered at API startup

Wired in `app/main.py` `on_startup`:

| Subscriber | Module | Behavior |
|------------|--------|----------|
| Domain Audit | `audit/domain_audit_subscriber.py` | Inserts `domain_audit_events` |
| Webhook (contracts) | `orchestration/webhook_event_subscriber.py` | Maps to draft; HTTP when `ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1` |
| Metrics | `orchestration/metrics_event_subscriber.py` | Increments existing lifecycle Prometheus counters for promote/approval |

## Invariants for contributors

1. Only aggregates emit Domain Events (`_emit` / business methods).
2. Application services **publish** events; they must not write Domain Audit rows or mutate Timeline tables directly.
3. Handlers must not publish additional business Domain Events.
4. Do not add Service → Audit / Timeline / Webhook HTTP dependencies for domain side effects; extend a handler instead.
5. Keep Domain Event payloads free of transport and actor fields (actor lives in `EventContext`).

## Outbox transport (Phase 2 Epic 4)

When **`ML_AIR_DOMAIN_EVENT_OUTBOX=1`**, `get_event_bus()` returns `PostgresOutboxEventBus`: envelopes are inserted into **`domain_event_outbox`** in the same DB connection as the business write; a background drain dispatches handlers. Default remains **`InProcessEventBus`** (synchronous, same-transaction Audit).

Replay / list: `GET|POST .../domain-events/outbox` — see [Phase 2 Epic 5](./phase-2.md).

Semantic realtime still uses its own optional `semantic_event_outbox` table — independent of Domain Event transport. See [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).
