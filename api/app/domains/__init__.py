"""MLAir domain packages (Phase 6).

Layers:
- **lifecycle** — dataset versions, lineage/materialization, readiness, semantic events
- **orchestration** — runs, tasks, pipelines, queues, workers
- **governance** — auth, models, policies, webhooks
- **observability** — traces, audit timeline, metrics, durable outbox transport
- **shared** — database and cross-cutting infra

Import from ``app.domains.<domain>.<module>`` (e.g. ``app.domains.lifecycle.lineage_service``).
"""
