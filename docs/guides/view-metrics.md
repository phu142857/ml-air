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

## Lifecycle counters (API and scheduler)

These counters track semantic lifecycle emits (independent of whether Redis Pub/Sub delivery succeeds). The API process increments them from `realtime_events`; the scheduler increments `mlair_lifecycle_training_completed_total` when a run reaches `SUCCESS` and `publish_training_completed` runs (same metric name as the API counter so dashboards can `sum` across jobs).

| Metric | Labels | Where incremented |
| --- | --- | --- |
| `mlair_lifecycle_training_triggered_total` | `blocked_by_gate` (`true` / `false`) | API on `training.triggered` |
| `mlair_lifecycle_training_completed_total` | (none) | API when emitting `training.completed` from a run row; scheduler on scheduler publish path |
| `mlair_lifecycle_buffer_threshold_met_total` | `accumulation_strategy` | API when buffer upsert crosses threshold |

Example queries:

```bash
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum(rate(mlair_lifecycle_training_completed_total[5m]))'
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum by (blocked_by_gate) (rate(mlair_lifecycle_training_triggered_total[15m]))'
```

## Readiness gate and persisted eligibility (API)

| Metric | Labels | Where incremented |
| --- | --- | --- |
| `mlair_readiness_blocked_total` | `path` (`runs_trigger`, `pipeline_run`) | After `check_run_readiness` returns not ready on gated train paths |
| `mlair_eligibility_denied_total` | `source` (audit source, bucketed), `reason` (first known denial code or `other` / `unknown`) | After `POST .../readiness/evaluate` persists when `ready` is false |

Example:

```bash
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum by (path) (rate(mlair_readiness_blocked_total[15m]))'
```

**Note:** `mlair_lifecycle_training_triggered_total` already counts Hub train intent (including `blocked_by_gate`); `mlair_readiness_blocked_total` counts only runs that hit the readiness gate and were marked blocked. Materialized versions are covered by `mlair_dataset_materialization_version_created_total` in the lineage service.

## Result

Prometheus returns current metric values for MLAir services.

## Done

Proceed to [Debug with Grafana](./debug-with-grafana.md).
