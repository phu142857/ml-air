"""MLAir domain packages (Phase 6).

Layers:
- **lifecycle** — dataset versions, lineage/materialization, readiness, semantic events
- **orchestration** — runs, tasks, pipelines, queues, workers
- **governance** — auth, models, policies, webhooks
- **observability** — traces, audit timeline, metrics, durable outbox transport
- **shared** — database and cross-cutting infra

Legacy imports via ``app.services.*`` remain as thin shims during migration.
"""
