# Event Flow

How Domain Events move from aggregates to subscribers.

## Contracts

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

## Runtime path (in-process)

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

## Aggregates

| Aggregate | Module | Events |
|-----------|--------|--------|
| `ModelVersionAggregate` | `governance/model_version_aggregate.py` | Created, Approved, Rejected, Promoted, Rollback, Deleted |
| `DatasetAggregate` | `lifecycle/dataset_aggregate.py` | Created, Deleted |
| `PipelineAggregate` | `orchestration/pipeline_aggregate.py` | `PipelineVersionCreated` |
| `RunAggregate` | `orchestration/run_aggregate.py` | Created, Started, Completed, Failed, Cancelled |
| `ReadinessAggregate` | `lifecycle/readiness_aggregate.py` | `ReadinessEvaluated` |

Publish sites: `model_registry_service`, `lineage_service`, `readiness_service`, `pipeline_version_service`, `run_service`, scheduler run transitions.

## Subscribers (API startup)

| Subscriber | Module | Behavior |
|------------|--------|----------|
| Domain Audit | `audit/domain_audit_subscriber.py` | Inserts `domain_audit_events` |
| Webhook | `orchestration/webhook_event_subscriber.py` | HTTP when `ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1` |
| Metrics | `orchestration/metrics_event_subscriber.py` | Lifecycle Prometheus counters |

Dispatch uses shared hardening (timeout, metrics, OTEL): `domain_event_dispatch.py`.

## Invariants

1. Only aggregates emit Domain Events.
2. Application services **publish** only; no direct Audit/Timeline writes.
3. Handlers must not publish business Domain Events.
4. Extend handlers for new side effects — not Service → HTTP clients.
5. Event payloads stay transport-free; actor lives in `EventContext`.

## Outbox transport

When **`ML_AIR_DOMAIN_EVENT_OUTBOX=1`**, envelopes persist to **`domain_event_outbox`**; a drain worker dispatches handlers asynchronously. Replay: [Domain Events](./domain-events.md).

Semantic realtime uses a separate **`semantic_event_outbox`** — see [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).
