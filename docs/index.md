# MLAir Documentation

**MLAir is a lifecycle operating system for ML** — dataset version → readiness → gated run → model governance. Docs are task-oriented and production-first.

## Run MLAir

```bash
git clone https://github.com/phu142857/ml-air.git
cd ml-air
pip install -e .

mlair build && mlair start
# or: export MLAIR_IMAGE=ghcr.io/phu142857/ml-air:v1.0.0 && mlair start --pull

mlair health
```

Open **http://localhost:8080/login**. Configuration: [configuration.md](./configuration.md). Install: [Installation](./getting-started/installation.md).

## Documentation philosophy

- Action over explanation
- Copy-paste runnable commands
- Goal → Steps → Command → Result

## Architecture (contributors)

- [Architecture Overview](./architecture/README.md)
- [Event Flow](./architecture/event-flow.md)
- [Domain Events](./architecture/domain-events.md)
- [Phase 3 — Read Platform](./architecture/phase-3.md)
- [Audit Flow](./architecture/audit-flow.md)
- [Timeline Flow](./architecture/timeline-flow.md)
- [Developer Guide](./architecture/developer-guide.md)

Semantic realtime (Hub Pub/Sub): [Lifecycle semantic event flow](./concepts/lifecycle-event-flow.md).

## Getting started

- [Configuration](./configuration.md)
- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Run your first pipeline](./getting-started/run-first-pipeline.md)

Model registry quick reference: [Model governance](./guides/model-governance.md), [API overview](./api/overview.md).

## Guides

### Run and orchestration

- [Run a pipeline](./guides/run-pipeline.md)
- [Task execution mode](./concepts/task-execution-mode.md)
- [External worker execution](./guides/external-worker-execution.md)
- [HTTP pipeline tasks](./guides/http-pipeline-tasks.md)
- [Resource usage attribution](./guides/usage-attribution.md)
- [Run environment](./guides/run-environment.md)
- [Monitor a run](./guides/monitor-run.md)
- [Retry a failed task](./guides/retry-failed-task.md)
- [Debugging](./guides/debugging.md)
- [Replay](./guides/replay.md)
- [Execution realtime architecture](./guides/execution-realtime-architecture.md)

### Lineage and versioning

- [Track lineage](./guides/track-lineage.md)
- [View lineage graph](./guides/view-lineage-graph.md)
- [Version a pipeline](./guides/version-pipeline.md)
- [Compare resources](./guides/compare-resources.md)

### Model lifecycle

- [Model governance](./guides/model-governance.md)
- [Register a model](./guides/register-model.md)
- [Model-centric pipeline mapping](./guides/model-centric-pipeline-mapping-and-trigger.md)
- [Downstream promote webhook](./guides/downstream-model-promote-webhook.md)
- [Semantic webhook cookbook](./guides/semantic-webhook-cookbook.md)
- [Lifecycle webhook](./guides/lifecycle-webhook.md)
- [Log metrics](./guides/log-metrics.md)

### Data and readiness

- [Configure data readiness and gating](./guides/configure-data-readiness-gating.md)
- [Dataset Hub and readiness](./guides/dataset-hub-and-readiness.md)
- [Dataset accumulation strategies](./guides/dataset-accumulation-strategies.md)
- [Manage datasets and train from model](./guides/manage-datasets-and-train-from-model.md)

### Plugins

- [Plugin development guide](./plugin-development-guide.md)
- [Create a plugin](./guides/create-plugin.md)
- [Validate a plugin](./guides/validate-plugin.md)
- [Reload plugin registry](./guides/reload-plugin.md)
- [Integrate app with plugin](./guides/integrate-app-with-plugin.md)

### Security and identity

- [Login and identity](./guides/login-and-identity.md)
- [MFA and recovery codes](./guides/mfa-and-recovery-codes.md)
- [Personal access tokens](./guides/personal-access-tokens.md)
- [Manage sessions](./guides/manage-sessions.md)
- [Verify manifest](./guides/verify-manifest.md)
- [Rotate keys](./guides/rotate-keys.md)

### Observability

- [View metrics](./guides/view-metrics.md)
- [OpenTelemetry](./guides/opentelemetry.md)
- [Trace explorer](./guides/use-trace-explorer.md)
- [Set up Prometheus](./guides/setup-prometheus.md)
- [Production maturity](./guides/production-maturity.md)
- [Resource usage contract v1](./guides/resource-usage-contract-v1.md)

### UI and scope

- [Hub lifecycle-first UX](./guides/hub-lifecycle-first.md)
- [Use dashboard](./guides/use-dashboard.md)
- [Explore lineage in UI](./guides/explore-lineage.md)
- [Configure tenant and project scope](./guides/configure-tenant-project-scope.md)
- [Bootstrap and scope sync](./guides/bootstrap-and-scope-sync-contract.md)

### Integrations

- [Reference integrations](./guides/reference-integrations.md)
- [Integrate external executor](./guides/integrate-external-executor.md)
- [Consume MLAir from Compose](./guides/consume-mlair-from-compose.md)
- [Sync external model registry](./guides/sync-external-model-registry.md)
- [Downstream executor control plane](./guides/downstream-executor-control-plane.md)

## Concepts

- [Lifecycle semantic event flow](./concepts/lifecycle-event-flow.md)
- [Lifecycle formal model](./concepts/lifecycle-formal-model.md)
- [Lifecycle state machines](./concepts/lifecycle-state-machines.md)
- [Pipeline](./concepts/pipeline.md)
- [Run](./concepts/run.md)
- [Task](./concepts/task.md)
- [Lineage](./concepts/lineage.md)
- [Plugin](./concepts/plugin.md)

## CLI and API

- [CLI commands](./cli/commands.md)
- [CLI development](./cli/dev.md)
- [`mlair run`](./cli/run.md)
- [`mlair logs`](./cli/logs.md)
- [API overview](./api/overview.md)
- [Readiness and gating](./api/readiness-and-gating.md)
- [Realtime event envelope](./api/realtime-event-envelope.md)
- [Traces API](./api/traces.md)
- [Cursor pagination](./api/cursor-pagination.md)
- [Dataset version immutability](./api/dataset-version-immutability.md)
- [POST /runs/trigger](./api/post-runs-trigger.md)

## Troubleshooting

- [Common errors](./troubleshooting/common-errors.md)
- [Readiness gate blocked](./troubleshooting/readiness-gate-blocked.md)
- [Manifest security](./troubleshooting/manifest-security.md)
- [SLO/SLA incident](./troubleshooting/slo-sla-incident.md)
- [Disaster recovery](./troubleshooting/disaster-recovery.md)
- [Backup and restore](./troubleshooting/backup-restore.md)
- [Lineage / replay v0.3 reference](./troubleshooting/lineage-replay-v03-reference.md)

## Runbooks

- [Production deployment](./runbooks/production-deployment.md)
- [Production strict lifecycle](./runbooks/production-strict-lifecycle.md)
- [Production WSS and ingress](./runbooks/production-wss-ingress.md)

## Releases

- [Historical release notes](./releases/README.md)

## Changelog

Shipped capabilities: [CHANGELOG.md](../CHANGELOG.md).
