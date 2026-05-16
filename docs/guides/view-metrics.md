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
| `mlair_lifecycle_model_promoted_total` | `stage` (normalized target stage, e.g. `production`) | API when `emit_model_promoted` runs after a successful promote |
| `mlair_lifecycle_model_version_approval_set_total` | `approval_status` (`pending_manual_approval`, `approved`, `rejected`, or `other`) | API when an approval status is written and `model.eligibility.updated` uses action `approval_updated` |

Example queries:

```bash
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum(rate(mlair_lifecycle_training_completed_total[5m]))'
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum by (blocked_by_gate) (rate(mlair_lifecycle_training_triggered_total[15m]))'
```

## Readiness gate and persisted eligibility (API)

| Metric | Labels | Where incremented |
| --- | --- | --- |
| `mlair_readiness_blocked_total` | `path` (`runs_trigger`, `pipeline_run`) | After `check_run_readiness` returns not ready on gated train paths |
| `mlair_eligibility_denied_total` | `source` (audit source, bucketed), `reason` (canonical bucket: `threshold_not_met`, `freshness_not_met`, `model_policy_mismatch`, `governance_blocked`, `legacy_compatibility_fallback`, `other`, `unknown`) | After `POST .../readiness/evaluate` **inserts a new** row when `ready` is false (deduplicated repeats do not increment) |

Stable internal → canonical → `reason` mapping: [Readiness and gating — Canonical readiness reason codes](./readiness-and-gating.md#canonical-readiness-reason-codes-global-contract-for-mlair).

Example:

```bash
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum by (path) (rate(mlair_readiness_blocked_total[15m]))'
```

**Note:** `mlair_lifecycle_training_triggered_total` already counts Hub train intent (including `blocked_by_gate`); `mlair_readiness_blocked_total` counts only runs that hit the readiness gate and were marked blocked.

Additional examples:

```bash
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum by (reason, source) (rate(mlair_eligibility_denied_total[1h]))'
```

## Materialization and buffer gauges (API)

Counters and histograms are emitted from [`api/app/domains/lifecycle/lineage_service.py`](../../api/app/domains/lifecycle/lineage_service.py). Alert rules reference some of these series in [`deploy/monitoring/alerts/mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml).

| Metric | Labels | Role |
| --- | --- | --- |
| `mlair_dataset_materialization_attempt_total` | `strategy`, `source_type` | Attempts |
| `mlair_dataset_materialization_version_created_total` | `strategy`, `source_type` | Successful immutable version rows |
| `mlair_dataset_materialization_failure_total` | `strategy`, `reason` | Failures |
| `mlair_dataset_materialization_unique_violation_total` | `constraint` | Idempotency / uniqueness collisions |
| `mlair_dataset_materialization_latency_seconds` | `strategy` | Histogram of materialization duration |
| `mlair_dataset_accumulation_current_size` | `strategy`, `source_type`, `window_status` | Buffer size gauge |
| `mlair_dataset_accumulation_target_threshold` | `strategy`, `source_type`, `window_status` | Configured threshold gauge |

Example:

```bash
curl -sG "http://localhost:9090/api/v1/query" --data-urlencode 'query=sum(rate(mlair_dataset_materialization_version_created_total[15m]))'
```

## Lifecycle semantic alerts (SLO-style heuristics)

Quickstart Prometheus loads [`deploy/monitoring/alerts/mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml). The **`mlair-lifecycle-semantic`** rule group fires **warning**-severity alerts on bursts of semantic lifecycle friction (thresholds are starting points — tune per tenant/project in your fork or overlay rules).

| Alert | Signal (simplified) |
| --- | --- |
| `MlAirLifecycleEligibilityDeniedBurst` | Many persisted `ready=false` evaluations (`mlair_eligibility_denied_total`) in a short window |
| `MlAirLifecycleReadinessGateBlockedBurst` | Many runs blocked at the execution readiness gate (`mlair_readiness_blocked_total`) |
| `MlAirLifecycleTrainIntentBlockedBurst` | Many Hub train intents with `blocked_by_gate=true` (`mlair_lifecycle_training_triggered_total`) |
| `MlAirLifecycleModelApprovalRejectedBurst` | Several model version `approval_status=rejected` updates (`mlair_lifecycle_model_version_approval_set_total`) |

Validate this file in CI / locally: **`make test-prometheus-rules`** (runs `promtool check rules` on [`deploy/monitoring/alerts/mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml); uses Docker when `promtool` is not installed — see root `Makefile`).

Materialization heuristics remain in the **`mlair-runtime`** group of the same file.

## Grafana (quickstart)

Dashboard JSON lives under [`deploy/monitoring/grafana/dashboards/`](../../deploy/monitoring/grafana/dashboards/). The quickstart Compose file mounts that directory into Grafana. Open **MLAir lifecycle (semantic metrics)** (`uid` `mlair-lifecycle-semantic`, [`mlair-lifecycle-semantic.json`](../../deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json)) for lifecycle, readiness gate, persisted eligibility, materialization, and **model governance** (promote + approval counters), and **MLAir Runtime Overview** (`mlair-runtime-overview`, [`mlair-overview.json`](../../deploy/monitoring/grafana/dashboards/mlair-overview.json)) for executor/scheduler views.

## Result

Prometheus returns current metric values for MLAir services.

## Done

Proceed to [Debug with Grafana](./debug-with-grafana.md).
