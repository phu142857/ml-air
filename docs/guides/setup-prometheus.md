# Set Up Prometheus

## Goal

Start Prometheus with MLAir scrape targets (optional all-in-one sidecar).

## Prerequisites

Prometheus is **off by default**. Enable it in `mlair.yaml`:

```yaml
infra:
  prometheus: true
```

Or set `MLAIR_INFRA_PROMETHEUS=1` in `.env` (see `deploy/.env.infra.example`). Then:

```bash
mlair rebuild   # or mlair start
```

## Steps

1. Confirm `mlair config print` shows `COMPOSE_PROFILES` including `prometheus` (or `MLAIR_INFRA_PROMETHEUS=1`).
2. Open Prometheus targets: `http://localhost:39090/targets` (default host port).
3. Verify MLAir scrape jobs are `UP`.

## Command

```bash
curl "http://localhost:39090/-/healthy"
```

## Result

Prometheus is healthy and collecting metrics from MLAir services.
Dashboards can now correlate pipeline run and task latency with plugin execution and lineage-related events.

## Done

Continue with [View Metrics](./view-metrics.md).
