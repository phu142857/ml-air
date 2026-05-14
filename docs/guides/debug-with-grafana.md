# Debug with Grafana

## Goal

Use Grafana dashboards to debug run latency and failures.

## Steps

1. Open Grafana.
2. Select an MLAir dashboard (for example **MLAir Runtime Overview** for executor/scheduler, or **MLAir lifecycle (semantic metrics)** for train intent, readiness gate, eligibility denied, materialization, and model promote/approval — see [`view-metrics`](./view-metrics.md#grafana-quickstart)).
3. Correlate spikes with run IDs and task failures.

## Command

```bash
xdg-open http://localhost:3001
```

## Result

You can identify bottlenecks and failure windows using dashboard panels.

For **firing alert rules** (including lifecycle burst heuristics), use Prometheus UI or Alertmanager as configured in your deploy; rule definitions live in [`deploy/monitoring/alerts/mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml) — see [View metrics — Lifecycle semantic alerts](./view-metrics.md#lifecycle-semantic-alerts-slo-style-heuristics). Validate rule YAML locally with **`make test-prometheus-rules`** (uses `promtool` or a small Prometheus container).

## Scope/Auth Panels

For multi-tenant scope debugging, add panels from metric `mlair_scope_decisions_total`:

- denied decisions by reason:
  - `sum by (reason_code) (increase(mlair_scope_decisions_total{decision="deny"}[15m]))`
- denied decisions by tenant/project:
  - `sum by (tenant_id, project_id) (increase(mlair_scope_decisions_total{decision="deny"}[15m]))`

Recommended alerts:

- spike alert (scope mismatch/regression):
  - trigger when `sum(increase(mlair_scope_decisions_total{decision="deny"}[5m])) > 20`
- stale mapping alert:
  - trigger when `sum(increase(mlair_scope_decisions_total{reason_code="mapping_version_stale"}[10m])) > 0`

## Done

Create or tune alert rules based on observed thresholds.
