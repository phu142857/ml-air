# Task execution mode (internal vs external)

## What this controls

`ML_AIR_TASK_EXECUTION_MODE` decides **who runs pipeline task code** — not whether a plugin is “built-in” or “custom”, and not whether usage tracking is on.

| Mode | Who executes the task | Default |
|------|------------------------|---------|
| **`internal`** | MLAir **built-in executor** (Redis queue → `executor` container) | Yes (quickstart) |
| **`external`** | **Your worker process** (lease → run → complete/fail API) | Opt-in |

Set the **same value** on **API** and **scheduler**. See [External worker execution](../guides/external-worker-execution.md) for external setup.

## Internal mode (`internal`)

```
Trigger run → Scheduler → Redis (mlair:tasks:*) → Executor → task_finished → Scheduler → DB
```

1. When a task is ready, the scheduler sets it **`RUNNING`** and **`RPUSH`**es a payload to Redis (`mlair:tasks:high|default|low`).
2. The **`executor`** service blocks on Redis, picks up the task, and runs it:
   - **`plugin_name`** → subprocess (`python -m mlair_runner <plugin>` or `ML_AIR_PLUGIN_RUNNER_MODULE`)
   - **`http_task`** → HTTP call defined in pipeline config
   - **neither** → reference **sleep stub** (demo only; finishes in milliseconds)
3. On finish, the executor pushes **`task_finished`** to `mlair:tasks:done`. The scheduler updates task/run state and ingests resource usage.

**Resource usage:** the executor auto-samples the task process tree (psutil / optional NVML). No client code required. See [Resource usage attribution](../guides/usage-attribution.md) and [Resource Usage Contract v1](../guides/resource-usage-contract-v1.md).

**Required services:** `api`, `scheduler`, **`executor`**, `redis`, `postgres`. If `executor` is down, tasks stay **`RUNNING`** with no progress.

**Plugin note:** `mlair_runner.py` ships **demo adapters** (`app_train_adapter`, …). Production training (YOLO, ETL, …) still runs in **internal** mode when you point the runner at your real module — see [executor/README.md](../../executor/README.md).

## External mode (`external`)

```
Trigger run → Scheduler → task QUEUED → Your worker POST /v1/tasks/lease → run job → complete/fail
```

1. Ready tasks enter **`QUEUED`** (not pushed to Redis for normal plugin tasks).
2. Your worker loops: **`POST /v1/tasks/lease`** with `worker_id` and `capabilities` (plugin names).
3. You implement execution (train, ETL, call scripts) using leased `plugin`, `plugin_context`, etc.
4. Report progress: **`heartbeat`**, **`logs`**, then **`complete`** or **`fail`**.

**Resource usage:** MLAir does **not** see processes on the worker machine. Send **`usage`** on heartbeat and **`resource_usage` / `usage_samples`** on complete/fail, or use `ResourceMonitor` from `sdk.resource_monitor`. See [Resource Usage Contract v1](../guides/resource-usage-contract-v1.md#worker-sdk-sdkresource_monitorpy).

**Executor container:** may stay up but **does not receive** normal plugin tasks in external mode (HTTP tasks can still use the internal Redis path — see [HTTP pipeline tasks](../guides/http-pipeline-tasks.md)).

Reference worker: [`scripts/external_worker_example.py`](../../scripts/external_worker_example.py).

## Plugin vs execution mode

These are **separate** ideas:

| Concept | Meaning |
|---------|---------|
| **Plugin** | Name of a pipeline step (`config_snapshot.tasks[].plugin`, e.g. `app_train_adapter`, `yolo_train`) |
| **Execution mode** | Where that step’s code **runs** (MLAir executor vs your worker) |

The same pipeline and plugin name can run **internally** (executor subprocess) or **externally** (worker implements the plugin capability).

## Comparison

| | Internal | External |
|---|----------|----------|
| Task status when ready | `RUNNING` | `QUEUED` until leased |
| Dispatch | Redis queue | Lease API |
| Who runs train/ETL code | `executor` | Your worker |
| Lease / heartbeat API | Disabled (lease returns empty) | Required for long jobs |
| Usage auto-collect | Yes (executor monitor) | No — worker must send |
| Scale-out | Multiple `executor` replicas on Redis | Multiple workers on lease |

## When to choose

| Scenario | Suggested mode |
|----------|----------------|
| Quickstart, DACN/YOLO in Compose, single stack | **internal** |
| GPU farm / training service already outside MLAir | **external** |
| Want zero worker code for usage on same host as executor | **internal** |

## Environment

| Variable | Services | Default | Meaning |
|----------|----------|---------|---------|
| `ML_AIR_TASK_EXECUTION_MODE` | API, scheduler | `internal` | `external` enables lease API and `QUEUED` tasks |

## Related docs

- [External worker execution](../guides/external-worker-execution.md)
- [End-to-end: control plane + external executor](../guides/downstream-executor-control-plane.md)
- [Resource usage attribution](../guides/usage-attribution.md)
- [Plugin concept](./plugin.md)
- [Task concept](./task.md)
- [executor/README.md](../../executor/README.md)
