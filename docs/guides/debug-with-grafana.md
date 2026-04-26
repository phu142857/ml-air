# Debug with Grafana

## Goal

Use Grafana dashboards to debug run latency and failures.

## Steps

1. Open Grafana.
2. Select MLAir dashboard.
3. Correlate spikes with run IDs and task failures.

## Command

```bash
xdg-open http://localhost:3001
```

## Result

You can identify bottlenecks and failure windows using dashboard panels.

## Done

Create or tune alert rules based on observed thresholds.
