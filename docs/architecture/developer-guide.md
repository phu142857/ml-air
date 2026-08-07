# Developer Guide

Practical guide for deploying and extending MLAir’s Domain Event / Audit / Timeline stack. Assumes you already know how to [install](../getting-started/installation.md) and [configure](../configuration.md) the all-in-one stack.

## Deploy / migrate

1. Run API DB migrations (included in the all-in-one container startup, or via Alembic in API-only setups).
2. Ensure revisions **`0049_domain_audit_events`** through **`0052_domain_webhook_subs`** (or later) are applied.
3. Start the API. On startup (`app/main.py`), MLAir registers:
    - Domain Audit subscriptions
   - Webhook event handler (noop or HTTP when `ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1`)
   - Metrics event handler
   - Optional domain event outbox drain when `ML_AIR_DOMAIN_EVENT_OUTBOX=1`

Default delivery is **in-process** (no extra worker). Enable outbox + domain webhook delivery via [Domain Events](./domain-events.md).

## Add a Domain Event to an existing aggregate

1. Define a frozen `@dataclass` subclass of `DomainEvent` next to the aggregate (or in the same module).
2. Emit it from an aggregate method via `_emit(...)`.
3. After successful persistence in the application service, `pull_events()` and `get_event_bus().publish_all(..., context=..., session=conn)`.
4. Pass a real DB connection as `session` when a handler must share the transaction (Audit does).

Do **not** call audit repositories, timeline writers, or HTTP webhook clients from the service.
Pass context via `build_event_context(tenant_id=…, project_id=…)` so Audit inherits the
request actor (bound by auth middleware / `authenticate_bearer`).

## Subscribe a new handler

1. Implement `DomainEventHandler.handle(envelope, *, session)`.
2. Register subscriptions in a `start_*_subscriptions()` function (see `domain_audit_subscriber.py`).
3. Call that starter from `on_startup` in `app/main.py`.
4. Prefer injecting ports (repository, sink, recorder) so unit tests can use fakes.

## Domain Audit API for integrators

```http
GET /v1/audit/events?tenant=...&project=...&action=model_version.promoted&limit=50
Authorization: Bearer <token>
```

```http
GET /v1/audit/events/{id}
Authorization: Bearer <token>
```

Viewer role on the tenant/project is required. Response DTOs hide internal column names (`tenant` / `project` instead of raw table fields).

Project timeline (resource history):

```http
GET /v1/tenants/{tenant_id}/projects/{project_id}/audit/timeline
```

## Tests to run when changing this area

From repo root with `PYTHONPATH` set to `api` (or your package layout):

```bash
PYTHONPATH=api python -m pytest \
  api/tests/test_domain_event_foundation.py \
  api/tests/test_domain_event_outbox.py \
  api/tests/test_event_context_actor_propagation.py \
  api/tests/test_core_aggregates_domain_events.py \
  api/tests/test_domain_audit_repository.py \
  api/tests/test_domain_audit_api_integration.py \
  api/tests/test_timeline_adapter_ordering.py \
  api/tests/test_timeline_audit_projection_deletion.py \
  api/tests/test_webhook_event_handler.py \
  api/tests/test_metrics_event_handler.py \
  api/tests/test_metrics_exactly_once.py \
  api/tests/test_pagination.py
```

## Architecture checklist (PRs)

- [ ] Domain Events originate from an Aggregate
- [ ] Application service only publishes via `DomainEventPublisher` / `get_event_bus()`
- [ ] No direct Domain Audit repository usage from application services
- [ ] No Timeline mutation from application services
- [ ] No new Service → outbound webhook client for domain lifecycle (use WebhookEventHandler / sink)
- [ ] Handlers do not publish business Domain Events
- [ ] Docs under `docs/architecture/` updated if flow or APIs change

## Where to look in code

| Concern | Path |
|---------|------|
| Event foundation | `api/app/domains/shared/events/` |
| ModelVersion events | `api/app/domains/governance/model_version_aggregate.py` |
| Dataset events | `api/app/domains/lifecycle/dataset_aggregate.py` |
| Pipeline events | `api/app/domains/orchestration/pipeline_aggregate.py` |
| Domain Audit | `api/app/domains/audit/` |
| Audit HTTP | `api/app/api/routes/audit_events_routes.py` |
| Timeline SQL | `api/app/domains/observability/audit_timeline_service.py` |
| Startup wiring | `api/app/main.py` |

## Further reading

- [Architecture Overview](./README.md)
- [Event Processing](./event-processing.md)
- [Domain Events](./domain-events.md)
- Semantic UI realtime (separate): [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md)
