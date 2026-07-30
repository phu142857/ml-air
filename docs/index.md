# MLAir Documentation

**MLAir is a lifecycle operating system for ML** — dataset version → readiness → gated run → model governance. Docs are task-oriented and production-first (action, runnable commands, minimal theory upfront).

## Run MLAir

One all-in-one image (Hub + API `/v1` + realtime `/ws` + scheduler + executor + Postgres + Redis) on a single port `8080`. Database migrations and every service start automatically inside the container — there is nothing else to run.

```bash
git clone https://github.com/phu142857/ml-air.git
cd ml-air
pip install -e .                 # installs the `mlair` CLI

# Option A — build the image locally, then start:
mlair build && mlair start

# Option B — pull the pre-built image (GHCR), then start:
export MLAIR_IMAGE=ghcr.io/phu142857/ml-air:v1.0.0
mlair start --pull

mlair health                     # verify the stack is up
```

Then open **http://localhost:8080/login** and sign in (bootstrap admin from `.env`). Defaults work out of the box; override via [Configuration](./configuration.md). Step-by-step in [Installation](./getting-started/installation.md) and [Login and Identity](./guides/login-and-identity.md).

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

- [Configuration (single reference)](./configuration.md)
- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Run Your First Pipeline](./getting-started/run-first-pipeline.md)

**Model registry (quick reference):** stages `staging` / `production` / `archived`, an approval step, and model promotion (production requires an approved version unless `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1`). See [Promote a Model](./guides/promote-model.md) and the [API Overview](./api/overview.md).

## Guides

### Run and Orchestration

- [Run a Pipeline](./guides/run-pipeline.md)
- [Task execution mode (internal vs external)](./concepts/task-execution-mode.md)
- [External Worker Execution (lease / pull)](./guides/external-worker-execution.md)
- [HTTP pipeline tasks](./guides/http-pipeline-tasks.md)
- [Resource usage attribution](./guides/usage-attribution.md)
- [Run environment capture (reproducibility snapshot)](./guides/run-environment.md)
- [Resource timeline (run detail)](./guides/monitor-run.md#resource-timeline-chart)
- [Resource Usage Contract v1](./guides/resource-usage-contract-v1.md)
- [Configure Data Readiness and Gating](./guides/configure-data-readiness-gating.md)
- [Monitor a Run](./guides/monitor-run.md)
- [Retry a Failed Task](./guides/retry-failed-task.md)
- [Debug a Failed Task](./guides/debug-failure.md)
- [Replay a Failed Run](./guides/replay-task.md)
- [Replay from DLQ](./guides/replay-dlq.md)
- [Partial Replay](./guides/partial-replay.md)
- [Execution realtime architecture](./guides/execution-realtime-architecture.md)

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
- [Model promotion governance](./guides/model-promotion-governance.md)
- [Model Page Governance Mode](./guides/model-page-governance-mode.md)
- [Model-centric pipeline mapping and run trigger](./guides/model-centric-pipeline-mapping-and-trigger.md)
- [Downstream model promote webhook (contract)](./guides/downstream-model-promote-webhook.md)
- [Semantic event webhooks (lifecycle JSON) — cookbook](./guides/semantic-webhook-cookbook.md)
- [Lifecycle webhook (training completed/failed)](./guides/lifecycle-webhook.md)
- [Slack / Discord lifecycle webhook example](./guides/slack-discord-lifecycle-webhook.example.md)
- [End-to-end: control plane + external executor](./guides/downstream-executor-control-plane.md)
- [Integrate an external executor / worker](./guides/integrate-external-executor.md)
- [Consume MLAir from Compose (decoupled)](./guides/consume-mlair-from-compose.md)
- [Sync External Model Registry](./guides/sync-external-model-registry.md)

### Plugin System

- [Create a Plugin](./guides/create-plugin.md)
- [Validate a Plugin](./guides/validate-plugin.md)
- [Reload Plugin Registry](./guides/reload-plugin.md)
- [Integrate App with Plugin](./guides/integrate-app-with-plugin.md)
- [Plugin versioning](./guides/plugin-versioning.md)

### Security and Identity

- [Login and Identity (Hub operators)](./guides/login-and-identity.md)
- [MFA and recovery codes](./guides/mfa-and-recovery-codes.md)
- [Personal Access Tokens (CLI & API)](./guides/personal-access-tokens.md)
- [Manage sessions](./guides/manage-sessions.md)
- [Verify Manifest](./guides/verify-manifest.md)
- [Rotate Keys](./guides/rotate-keys.md)
- [Replay Security Checks](./guides/replay-security.md)

### Observability

- [View Metrics](./guides/view-metrics.md)
- [Resource usage attribution](./guides/usage-attribution.md)
- [Resource Usage Contract v1](./guides/resource-usage-contract-v1.md)
- [OpenTelemetry (traces, OTLP)](./guides/opentelemetry.md)
- [Use the Trace Explorer](./guides/use-trace-explorer.md)
- [Set Up Prometheus](./guides/setup-prometheus.md)
- [Debug with Grafana](./guides/debug-with-grafana.md)
- [Verify observability on a run](./guides/verify-phase2-run.md)
- [Semantic observability — documented gaps](./guides/semantic-observability-gaps.md)
- [Production maturity checklist](./guides/production-maturity.md)

### UI

- [Hub lifecycle-first UX](./guides/hub-lifecycle-first.md)
- [Dataset Hub and Readiness](./guides/dataset-hub-and-readiness.md)
- [Use Dashboard](./guides/use-dashboard.md)
- [Explore Lineage in UI](./guides/explore-lineage.md)
- [Debug Run in UI](./guides/debug-run-ui.md)
- [Configure Tenant and Project Scope](./guides/configure-tenant-project-scope.md)
- [Bootstrap and Scope Sync Contract](./guides/bootstrap-and-scope-sync-contract.md)
- [Manage Datasets and Train from Model](./guides/manage-datasets-and-train-from-model.md)
- [Dataset accumulation strategies](./guides/dataset-accumulation-strategies.md)

## Concepts

- [Lifecycle semantic event flow](./concepts/lifecycle-event-flow.md)
- [Lifecycle formal model (MVP)](./concepts/lifecycle-formal-model.md)
- [Lifecycle state machines (MVP)](./concepts/lifecycle-state-machines.md)
- [Pipeline](./concepts/pipeline.md)
- [Run](./concepts/run.md)
- [Task](./concepts/task.md)
- [Task execution mode (internal vs external)](./concepts/task-execution-mode.md)
- [Lineage](./concepts/lineage.md)
- [Plugin](./concepts/plugin.md)

## CLI and API

- [CLI Commands](./cli/commands.md)
- [CLI local development](./cli/dev.md)
- [`mlair run`](./cli/run.md)
- [`mlair logs`](./cli/logs.md)
- [API Overview](./api/overview.md) (datasets: **`POST .../datasets/{id}/materialize`**, buffer, readiness history)
- [Traces API](./api/traces.md) (list, search, detail, export, ingest)
- [Realtime event envelope (v1)](./api/realtime-event-envelope.md) (Redis payload + `payload` field matrix; links to event-flow diagrams)
- [Cursor pagination](./api/cursor-pagination.md)
- [Tenant quotas](./api/tenant-quotas.md)
- [Dataset version retention](./api/dataset-retention.md)
- [Dataset version immutability](./api/dataset-version-immutability.md)
- [POST /tenants/…/projects/registry](./api/post-tenant-projects-registry.md)
- [POST /runs/trigger](./api/post-runs-trigger.md)
- [Readiness and Gating API](./api/readiness-and-gating.md)
- [POST /models](./api/post-models.md)
- [POST /models/{id}/versions](./api/post-model-versions.md)
- [GET /models/{id}/versions](./api/get-model-versions.md)
- [Model-centric pipeline mapping and run trigger (guide)](./guides/model-centric-pipeline-mapping-and-trigger.md)

## External MLOps Integration

- [Reference: external integration surfaces](./guides/reference-integrations.md)
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
- [Release Notes v0.3.0](./troubleshooting/release-notes-v0.3.0.md)
- [Lineage / replay v0.3 reference](./troubleshooting/lineage-replay-v03-reference.md)

## Runbooks (staging / production)

Deploy and sign off without reading application source:

- [Production deployment](./runbooks/production-deployment.md) — all-in-one, Helm, env merge, checklists
- [Production strict lifecycle](./runbooks/production-strict-lifecycle.md) — strict pinning + L4 sync + verification
- [Production WSS and ingress](./runbooks/production-wss-ingress.md) — realtime WebSocket behind TLS

## Plugin development

- [Plugin development guide](./plugin-development-guide.md) — index for create, validate, reload, integrate

## Evaluation

- [Evaluation docs placeholder](./evaluation/README.md) — reserved; see readiness / metrics / promote links inside

## Documentation Rules

- One file = one task
- Use relative links only
- Do not create folders outside the agreed docs structure
- No hidden setup steps
- No outdated snippets

## Definition of Done (Docs)

- New user completes Quickstart without asking for help
- New user builds a plugin successfully ([plugin development guide](./plugin-development-guide.md))
- Debug guide can be used to resolve a real failure
- Production deploy follows [runbooks](./runbooks/production-deployment.md) without reading application source
- No dependency on tribal knowledge
