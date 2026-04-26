# Set Up Prometheus

## Goal

Start Prometheus with MLAir scrape targets.

## Steps

1. Start observability stack.
2. Open Prometheus target page.
3. Verify all required targets are `UP`.

## Command

```bash
make up
curl "http://localhost:9090/-/healthy"
```

## Result

Prometheus is healthy and collecting metrics from MLAir services.
Dashboards can now correlate pipeline run and task latency with plugin execution and lineage-related events.

## Done

Continue with [View Metrics](./view-metrics.md).
