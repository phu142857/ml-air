# Evaluation harness (P2)

Measure control-plane properties against a running MLAir API: API and admission latency (p50/p95/p99), scheduler tasks/sec, queue latency, worker-crash recovery time, and observed usage vs kernel ground truth.

This is **not** the Airflow+MLflow RSS baseline (that is P3 on the same machine). Do not treat a 7.9× RSS claim as a result of this harness.

**Related:** [Readiness and gating](../api/readiness-and-gating.md) · [Resource usage attribution](./usage-attribution.md) · [Task](../concepts/task.md) · [Run](../concepts/run.md)

## Matrix

Publishable axes (ATC'26 follow-up):

| Axis | Values |
| --- | --- |
| Tenants | 1, 10, 50 |
| Tasks | 100, 1000 |
| Concurrency | 1, 10, 100 |

The **publish** profile does **not** run the full cartesian product. It runs a reduced cell list: concurrency sweep, tenant sweep, and a 1000-task cell. `smoke` uses 1 tenant, 8 tasks, concurrency 2.

Each submitted run uses pipeline `eval_echo_pipeline` (one `echo_tracking` plugin task) plus a tiny CSV dataset version so readiness gates pass.

## Command

Stack must be up (`mlair start` / all-in-one on `http://localhost:8080`).

```bash
# Unit tests (no cluster)
PYTHONPATH=api:scripts python -m unittest api.tests.test_eval_harness -q

# Live smoke (default profile)
python scripts/eval_harness.py --profile smoke --out /tmp/mlair-eval-smoke.json

# Camera-ready cells + worker-crash RTO
python scripts/eval_harness.py --profile publish --out /tmp/mlair-eval-publish.json

# Subset
python scripts/eval_harness.py --only api,admission
```

Makefile: `make eval-harness` (smoke) and `make test-eval-harness` (unit).

Login uses the same bootstrap admin as smoke scripts (`admin` / `admin-change-me` unless overridden).

## Metrics

| Key | How it is measured |
| --- | --- |
| `api` | Timed `GET /health`, `GET .../admission/stats`, `GET .../runs/{id}` |
| `admission` | Timed `POST .../admission/explain` ResourceState only (ACCEPT vs GPU `RESOURCE_CAPACITY`) |
| `submit[].http` | Timed `POST .../runs` p50/p95/p99 |
| `submit[].scheduler_tasks_per_sec` | Tasks that reach `started_at` / wall time of that cell |
| `submit[].queue_latency_ms` | POST return → first task `started_at` (client poll ~250ms) |
| `crash.rto_ms` | Internal: supervisor restart of `executor` then next task start. External: lease drop until `PENDING` |
| `attribution` | `GET .../tasks/{id}/usage` observed memory vs harness `VmRSS` from container `/proc/<pid>/status` |

`--crash` is implied by `--profile publish`. Smoke skips crash unless you pass `--crash` (it restarts the executor).

## Result

JSON on stdout (and `--out`). Example smoke keys: `api`, `admission`, `submit`, `attribution`. Inspect `p50` / `p95` / `p99` under each latency block.

Tenant sweep registers `eval_t00`… scopes via `POST .../projects/registry`. Quota limits may cap 50 tenants; the report then shows HTTP 429/400 on those cells.

## Notes

- Internal execution is the default runtime under test. External lease RTO is used only when `ML_AIR_TASK_EXECUTION_MODE=external`.
- Queue latency includes poll interval; it is an upper bound, not a kernel timestamp delta.
- Attribution ground truth requires `docker`/`podman` exec into the `mlair` container **while the task PID is alive**. Short `echo_tracking` tasks often exit first; then `memory_relative_error` is null and `ground_truth_error` records `No such file`. Observed usage and `telemetry_trust` are still recorded.
