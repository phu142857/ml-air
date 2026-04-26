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

## Guides

### Run and Orchestration

- [Run a Pipeline](./guides/run-pipeline.md)
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

## Concepts

- [Pipeline](./concepts/pipeline.md)
- [Run](./concepts/run.md)
- [Task](./concepts/task.md)
- [Lineage](./concepts/lineage.md)
- [Plugin](./concepts/plugin.md)

## CLI and API

- [CLI Commands](./cli/commands.md)
- [API Overview](./api/overview.md)

## Troubleshooting

- [Common Errors](./troubleshooting/common-errors.md)
- [Manifest Security Runbook](./troubleshooting/manifest-security.md)
- [SLO/SLA Incident Runbook](./troubleshooting/slo-sla-incident.md)
- [Disaster Recovery](./troubleshooting/disaster-recovery.md)
- [Backup and Restore](./troubleshooting/backup-restore.md)

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
