# Resource usage attribution

MLair records **resource consumption** per task and roll up per run: CPU time, memory, GPU time, and disk I/O bytes. There is **no monetary cost estimation** in the platform.

**Lifecycle OS sign-off:** usage attribution is **optional** for production gate — operators sign off on Wave 0/1 + WSS; dollar chargeback / billing-tag export is **future work** ([staging-prod sign-off](../runbooks/staging-prod-signoff.md#optional-cost-attribution-does-not-block-sign-off)).

**Contract:** field names, scales (CPU 0–100 on the worker host), and complete/heartbeat payloads are defined in [Resource Usage Contract v1](./resource-usage-contract-v1.md).

For **who runs tasks** (internal executor vs external worker), see [Task execution mode](../concepts/task-execution-mode.md). Usage collection depends on that mode.

## Enable

- `ML_AIR_USAGE_TRACKING_ENABLED=1` (default on; legacy alias `ML_AIR_USAGE_COST_ENABLED`)
- `ML_AIR_RESOURCE_MONITOR_ENABLED=1` (default on) — executor PID-scoped sampling via psutil/NVML
- `ML_AIR_RESOURCE_SAMPLE_INTERVAL=1` — seconds between local samples (in-memory buffer; default matches live UI)
- `ML_AIR_RESOURCE_FLUSH_INTERVAL=1` — periodic flush of the latest sample to `task_usage_samples` for live run UI (0 = disable)
- Migrations `0032_usage_cost`, `0033_usage_drop_cost`, `0034_usage_sample_stats` (avg/peak from heartbeats)

Apply migrations on the API database:

```bash
cd api && alembic upgrade head
```

Tenant and project scope are always read from the **`runs`** row in the database, not from hardcoded defaults in events.

## Who collects metrics?

| Execution mode | Live CPU/RAM/GPU on run detail | Full task summary (task detail) | Client code required? |
|----------------|--------------------------------|----------------------------------|------------------------|
| **Internal** ([default](../concepts/task-execution-mode.md)) | Executor flush → `live[]` (~every 1s while RUNNING) | After task completes → `task_usage` | **No** |
| **External** | Worker **`heartbeat`** with `usage` | Worker **`complete`/`fail`** with `resource_usage` + optional `usage_samples` | **Yes** |

## Internal executor (Hybrid A + C)

When a task runs in the **built-in executor** (`ML_AIR_TASK_EXECUTION_MODE=internal`):

1. A monitor thread samples the **plugin subprocess PID tree** every `ML_AIR_RESOURCE_SAMPLE_INTERVAL` seconds (default **1s**).
2. Samples are buffered **in memory** on the executor; the latest sample is flushed every `ML_AIR_RESOURCE_FLUSH_INTERVAL` seconds (default **1s**) to `task_usage_samples` for the live run UI — flush is decoupled from sampling so live updates stay on cadence even if sample interval is higher.
3. On task complete/fail, the executor sends **`usage_samples[]` + `resource_usage` summary** in the single `task_finished` event; the scheduler batch-inserts samples and writes `task_usage`.

The executor needs **`ML_AIR_DATABASE_URL`** for periodic flush (set in quickstart Compose).

## External workers

When `ML_AIR_TASK_EXECUTION_MODE=external`, MLAir cannot read processes on the worker host. Use the lease worker API and the shared SDK:

```python
from sdk.resource_monitor import ResourceMonitor

with ResourceMonitor(task_id=task_id, flush_interval_seconds=0) as monitor:
    run_training()
payload = monitor.complete_bundle()  # resource_usage + usage_samples
```

See [Resource Usage Contract v1](./resource-usage-contract-v1.md) and [External worker execution](./external-worker-execution.md).

On task complete, pass `resource_usage` (all fields optional) and optionally **`usage_samples`** (batch from local buffer):

```json
{
  "worker_id": "worker-1",
  "resource_usage": {
    "duration_ms": 7200000,
    "cpu_time_seconds": 3600,
    "memory_rss_kb": 8388608,
    "gpu_seconds": 7200,
    "gpu_memory_mb_seconds": 57600,
    "disk_read_bytes": 1073741824,
    "disk_write_bytes": 536870912
  },
  "usage_samples": [
    {
      "sampled_at": "2026-05-30T10:00:00+00:00",
      "cpu_percent": 72,
      "memory_mb": 3500,
      "gpu_util_percent": 95,
      "gpu_memory_mb": 6200
    }
  ]
}
```

On heartbeat (for **live** run UI while RUNNING), pass `usage` incrementally:

```json
{
  "worker_id": "worker-1",
  "usage": {
    "cpu_percent": 72,
    "memory_mb": 3500,
    "gpu_util_percent": 95,
    "gpu_memory_mb": 6200
  }
}
```

See [External worker execution](./external-worker-execution.md).

## When the Hub shows data

| UI location | While task RUNNING | After task completes |
|-------------|-------------------|----------------------|
| Run → **Tasks & resources** | Elapsed (every 1s); CPU/RAM/GPU from `live[]` (poll every 1s; internal flush default 1s) | Elapsed frozen; latest sample values |
| Task detail → **Resource attribution** | Usually empty (“No resource usage yet”) | Full totals, avg/peak, disk I/O from `task_usage` |

Short stub tasks may show **`—`** for live CPU/RAM/GPU until the first flush (~1s) or until the task finishes.

## API

`GET /v1/tenants/{tenant}/projects/{project}/runs/{run_id}/usage`

Response:

```json
{
  "run_id": "...",
  "enabled": true,
  "usage": { },
  "tasks": [ ],
  "live": [
    {
      "task_id": "...",
      "runtime_seconds": 120,
      "cpu_percent": 45.2,
      "memory_mb": 1024,
      "gpu_util_percent": null,
      "gpu_memory_mb": null,
      "sample_count": 24
    }
  ]
}
```

- **`live[]`** — latest CPU/RAM/GPU snapshot per task (running or completed with samples).
- **`tasks[]`** — persisted `task_usage` rows (after each task completes); includes `plugin`, avg/peak stats.
- **`usage`** — run-level rollup from `run_usage` (when aggregated).

`GET /v1/tenants/{tenant}/projects/{project}/tasks/{task_id}/usage`

Response: `{ task_id, usage, enabled }` — single-task bundle for task detail.

`GET /v1/tenants/{tenant}/projects/{project}/usage?days=30&top_runs=10`

Response: `{ tenant_id, project_id, days, run_count, usage, runs[], enabled }` — project rollup from `run_usage`.

`GET /v1/tenants/{tenant}/usage?days=30`

Response: `{ tenant_id, days, run_count, usage, projects[], enabled }` — tenant rollup with per-project breakdown.

## Hub

Run detail → **Tasks & resources** tab: elapsed time and the latest CPU/RAM/GPU reading per task (live while running, last sample when done).

Task detail → **Resource attribution** section: complete CPU, memory, GPU, and disk metrics for one task.

Dashboard → **Resource attribution** panel (project scope or tenant-wide when project is aggregate).

See also [Monitor a Run](./monitor-run.md) and [Debug Run in UI](./debug-run-ui.md).

## Troubleshooting

### Run tab shows `—` for CPU/RAM/GPU

1. Confirm **`enabled: true`** on `GET .../runs/{run_id}/usage`.
2. **Internal mode:** is the **`executor`** container running? Tasks need `plugin_name` or `http_task` for meaningful work; missing plugin runs a short sleep stub.
3. **Internal mode:** wait at least **`ML_AIR_RESOURCE_FLUSH_INTERVAL`** (default 1s) after task start for the first live sample.
4. **External mode:** is the worker sending **`usage`** on heartbeat?
5. Check DB: `SELECT COUNT(*) FROM task_usage_samples WHERE task_id = '...';`

### Task detail shows “No resource usage yet”

- Expected while the task is still **RUNNING**.
- After terminal status: confirm scheduler ingested usage (`SELECT * FROM task_usage WHERE task_id = '...';`).
- Run migrations: `cd api && alembic upgrade head`.
- Rebuild **executor** and **scheduler** images after upgrading MLAir.

### `enabled: false` in API response

Set `ML_AIR_USAGE_TRACKING_ENABLED=1` on the **API** service (and restart).

### GPU columns always empty

Install NVML on the executor/worker host (`nvidia-ml-py`) and ensure the task process uses the GPU in a visible PID tree.

### Executor log hints

Look for `resource_monitor_flush_failed` or scheduler `task_usage_ingest_failed`.

## Related docs

- [Resource Usage Contract v1](./resource-usage-contract-v1.md)
- [Task execution mode (internal vs external)](../concepts/task-execution-mode.md)
- [External worker execution](./external-worker-execution.md)
- [executor/README.md](../../executor/README.md)
