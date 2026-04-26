# View Metrics

## Goal

View platform and run metrics for health and performance.

## Steps

1. Ensure stack is running.
2. Open Prometheus endpoint.
3. Query run/task metrics.

## Command

```bash
make up
curl "http://localhost:9090/api/v1/query?query=mlair_scheduler_queue_depth"
```

## Result

Prometheus returns current metric values for MLAir services.

## Done

Proceed to [Debug with Grafana](./debug-with-grafana.md).
