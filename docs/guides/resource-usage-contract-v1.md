# Resource Usage Contract v1

Worker-agnostic resource telemetry for MLAir runs and tasks. No framework names, no dollar cost, no GPU vendor fields.

**Related:** [Resource usage attribution](./usage-attribution.md) · [Task execution mode](../concepts/task-execution-mode.md) · [External worker execution](./external-worker-execution.md)

## Semantics

| Field | Meaning |
|-------|---------|
| `cpu_percent`, `cpu_percent_peak` | **0–100 machine utilization** on the worker host (not “sum of cores unbounded”). |
| `memory_mb`, `memory_mb_peak` | RSS of the monitored process tree, megabytes. |
| `gpu_util_percent`, `gpu_percent_peak` | GPU utilization 0–100 when NVML (or worker) provides it. |
| `gpu_memory_mb`, `gpu_memory_mb_peak` | GPU memory used by monitored PIDs, MB. |
| `duration_seconds` | Wall-clock seconds for the task on the worker. |
| `cpu_time_seconds` | Process CPU time (user+system) seconds. |
| `disk_read_bytes` / `disk_write_bytes` | Process-tree disk I/O delta when available. |

Legacy ingest fields (`duration_ms`, `memory_rss_kb`, `gpu_seconds`, …) remain accepted; the platform maps `duration_seconds` ↔ `duration_ms` automatically.

## Worker SDK (`sdk/resource_monitor.py`)

Any Python worker (YOLO, PyTorch, TensorFlow, LLM, custom) can use the same monitor:

```python
from sdk.resource_monitor import ResourceMonitor

with ResourceMonitor(task_id=task_id) as monitor:
    run_training()

summary = monitor.summary()
# {
#   "duration_seconds": 1820,
#   "cpu_time_seconds": 3600,
#   "cpu_percent_peak": 92,
#   "memory_mb_peak": 4120,
#   "gpu_percent_peak": 88,
#   "gpu_memory_mb_peak": 7420,
#   ...
# }

payload = monitor.complete_bundle()
# { "resource_usage": { ... v1 + legacy ... }, "usage_samples": [ ... ] }
```

- **Internal executor** uses `TaskResourceMonitor` (same sampling logic).
- **External workers** use `ResourceMonitor` + lease/complete API.
- Set `flush_interval_seconds=0` on external workers unless the task is leased with a known `task_id` and live Hub updates are needed.

## Complete / fail payload

```json
{
  "worker_id": "worker-1",
  "metrics": {},
  "artifacts": [],
  "resource_usage": {
    "duration_seconds": 1820,
    "cpu_time_seconds": 3600,
    "cpu_percent_peak": 92,
    "memory_mb_peak": 4120,
    "gpu_percent_peak": 88,
    "gpu_memory_mb_peak": 7420,
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

Peaks in `resource_usage` are optional when `usage_samples[]` is present; ingest derives avg/peak from samples and merges explicit peaks when provided.

## Heartbeat (live)

While `RUNNING`, optional:

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

From the SDK: `monitor.latest_heartbeat_usage()` inside a long-running `with ResourceMonitor(...)` block.

## Persistence (no new tables)

| Contract concept | MLAir table |
|------------------|-------------|
| Task peaks + totals | `task_usage` |
| Run rollup | `run_usage` |
| Timeline samples | `task_usage_samples` |

## Reference worker

From repo root (requires `psutil`):

```bash
export MLAIR_API_BASE_URL=http://localhost:8080
export MLAIR_WORKER_TOKEN=your-token
PYTHONPATH=. python scripts/external_worker_example.py
```

## Versioning

- **v1** (this document): peaks + duration + disk; machine-scaled CPU percent.
- Future v2+ may add fields; v1 fields remain stable for ingest.
