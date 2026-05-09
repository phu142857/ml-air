# MLAir Documentation

MLAir documentation follows a task-oriented, production-first approach inspired by MLflow and Apache Airflow.

## Documentation Philosophy

The goal is not to explain the system in theory, but to help users run, extend, and debug MLAir with minimal friction.

### Core Principles

- Action over explanation
- Copy-paste runnable commands
- Minimal theory upfront
- Short, predictable structure
- Real-world scenarios first

Each guide follows:

`Goal -> Steps -> Command -> Result -> Done`

## Getting Started

- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Run Your First Pipeline](./getting-started/run-first-pipeline.md)

**Model registry contract:** **stages** `staging` / `production` / `archived`, **approval** (`GET|PUT .../versions/{v}/approval`), **`POST .../models/{model_id}/promote`** (production requires `approved` unless `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1`) — see [ARCHITECTURE.md](../ARCHITECTURE.md) §7. **Serving slots** (`model_serving_slots`; draft `GET|PUT .../serving/...`) are described there and in OpenAPI; the **HTTP routes are currently disabled** in `v1.py` and the UI is hidden until re-enabled.

## Guides

### Run and Orchestration

- [Runbook: Realtime / WebSocket service](./runbooks/realtime-service.md)
- [Runbook: Readiness v2 Cutover](./runbooks/readiness-v2-cutover.md)
- [Run a Pipeline](./guides/run-pipeline.md)
- [External Worker Execution (lease / pull)](./guides/external-worker-execution.md)
- [Configure Data Readiness and Gating](./guides/configure-data-readiness-gating.md)
- [Monitor a Run](./guides/monitor-run.md)
- [Retry a Failed Task](./guides/retry-failed-task.md)
- [Replay from DLQ](./guides/replay-dlq.md)
- [Partial Replay](./guides/partial-replay.md)

### Lineage and Versioning

- [Track Lineage](./guides/track-lineage.md)
- [View Lineage Graph](./guides/view-lineage-graph.md)
- [Version a Pipeline](./guides/version-pipeline.md)
- [Compare Pipeline Versions](./guides/compare-pipeline-versions.md)

### Tracking and Model Lifecycle

- [Log Metrics](./guides/log-metrics.md)
- [Compare Runs](./guides/compare-runs.md)
- [Register a Model](./guides/register-model.md)
- [Promote a Model](./guides/promote-model.md)
- [Model-centric pipeline mapping and run trigger](./guides/model-centric-pipeline-mapping-and-trigger.md)
- [Downstream model promote webhook (contract)](./guides/downstream-model-promote-webhook.md)
- [End-to-end: control plane + external executor](./guides/downstream-executor-control-plane.md)
- [Integrate an external executor / worker](./guides/integrate-external-executor.md)
- [Consume MLAir from Compose (decoupled)](./guides/consume-mlair-from-compose.md)
- [Sync External Model Registry](./guides/sync-external-model-registry.md)

### Plugin System

- [Create a Plugin](./guides/create-plugin.md)
- [Validate a Plugin](./guides/validate-plugin.md)
- [Reload Plugin Registry](./guides/reload-plugin.md)
- [Integrate App with Plugin](./guides/integrate-app-with-plugin.md)

### Security

- [Verify Manifest](./guides/verify-manifest.md)
- [Rotate Keys](./guides/rotate-keys.md)
- [Replay Security Checks](./guides/replay-security.md)

### Observability

- [View Metrics](./guides/view-metrics.md)
- [Set Up Prometheus](./guides/setup-prometheus.md)
- [Debug with Grafana](./guides/debug-with-grafana.md)

### UI

- [Use Dashboard](./guides/use-dashboard.md)
- [Explore Lineage in UI](./guides/explore-lineage.md)
- [Debug Run in UI](./guides/debug-run-ui.md)
- [Configure Tenant and Project Scope](./guides/configure-tenant-project-scope.md)
- [Bootstrap and Scope Sync Contract](./guides/bootstrap-and-scope-sync-contract.md)
- [Manage Datasets and Train from Model](./guides/manage-datasets-and-train-from-model.md)

## Concepts

- [Pipeline](./concepts/pipeline.md)
- [Run](./concepts/run.md)
- [Task](./concepts/task.md)
- [Lineage](./concepts/lineage.md)
- [Plugin](./concepts/plugin.md)

## CLI and API

- [CLI Commands](./cli/commands.md)
- [API Overview](./api/overview.md)
- [POST /runs/trigger](./api/post-runs-trigger.md)
- [Readiness and Gating API](./api/readiness-and-gating.md)
- [POST /models](./api/post-models.md)
- [POST /models/{id}/versions](./api/post-model-versions.md)
- [GET /models/{id}/versions](./api/get-model-versions.md)
- [Model-centric pipeline mapping and run trigger (guide)](./guides/model-centric-pipeline-mapping-and-trigger.md)

## External MLOps Integration

- [Integrate App with Plugin](./guides/integrate-app-with-plugin.md)
- [Sync External Model Registry](./guides/sync-external-model-registry.md)

## Troubleshooting

- [Common Errors](./troubleshooting/common-errors.md)
- [Readiness Gate Blocked](./troubleshooting/readiness-gate-blocked.md)
- [Manifest Security Runbook](./troubleshooting/manifest-security.md)
- [SLO/SLA Incident Runbook](./troubleshooting/slo-sla-incident.md)
- [Disaster Recovery](./troubleshooting/disaster-recovery.md)
- [Backup and Restore](./troubleshooting/backup-restore.md)
- [Release Notes v0.6.94](./troubleshooting/release-notes-v0.6.94.md)

## Documentation Rules

- One file = one task
- Use relative links only
- Do not create folders outside the agreed docs structure
- No hidden setup steps
- No outdated snippets

## Definition of Done (Docs)

- New user completes Quickstart without asking for help
- New user builds a plugin successfully
- Debug guide can be used to resolve a real failure
- No dependency on tribal knowledge
