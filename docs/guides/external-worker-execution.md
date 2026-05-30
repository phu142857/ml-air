# External worker execution (pull / lease)

## Goal

Run pipeline tasks **outside** the built-in Redis executor: an external process (your own worker or training service) **leases** work from MLAir, executes it, then calls **complete** or **fail**. MLAir remains the source of truth for run and task status.

For a comparison with **internal** mode (default Redis executor), see [Task execution mode](../concepts/task-execution-mode.md).

## When to use this

- You want **async, distributed** execution without embedding business HTTP calls inside MLAir.
- Workers scale independently; MLAir keeps **orchestration + scheduling + DB state**.

## Model-centric runs and `plugin_context`

If the run was created with **`POST .../runs/trigger`**, the scheduler publishes tasks whose payload includes **`plugin_context`** built by the API after **pipeline mapping + dataset resolution** (model id, dataset ids, optional `artifact_uri`, etc.). See [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md#plugin_context-for-post-runstrigger). For a full narrative from mapping → trigger → lease → complete → optional promote → optional webhook, see [End-to-end: MLAir control plane + external executor](./downstream-executor-control-plane.md).

## Prerequisites

1. Database migration **`0011_task_worker_lease`** applied (`alembic upgrade head` on the API/scheduler image).
2. **`ML_AIR_TASK_EXECUTION_MODE=external`** on **both** API and scheduler (same value everywhere in the stack).
3. Optional: **`ML_AIR_WORKER_TOKEN`** for a dedicated Bearer used only by workers (see [Environment](#environment)).

## Steps

### 1. Turn on external mode

Set in `.env` or container env (see `.env.example`):

- `ML_AIR_TASK_EXECUTION_MODE=external`

Restart **api** and **scheduler**. The executor container may stay running but will not receive tasks for externally scheduled runs (tasks go to `QUEUED`, not Redis).

### 2. Run a pipeline as usual

Create a run through the normal API (for example your control plane calling MLAir). Tasks that become ready enter **`QUEUED`** with a **`plugin`** name taken from `config_snapshot.tasks[].plugin`.

### 3. Implement the worker loop

1. `POST /v1/tasks/lease` with `worker_id`, `capabilities` (plugin names you implement), `max_tasks`.
2. For each leased task: run your logic (train, ETL, etc.).
3. While **RUNNING**, stream stdout-style lines: `POST /v1/tasks/{task_id}/logs` (see [Streaming logs](#streaming-logs)).
4. On success: `POST /v1/tasks/{task_id}/complete` with `worker_id`, optional `metrics`, and `artifacts` (or legacy `artifact_uri`). Metrics and artifacts are persisted to `run_metrics` / `run_artifacts` (same as the internal executor) and appear in Hub **Metrics** / **Artifacts**.
5. On failure: `POST /v1/tasks/{task_id}/fail` with `worker_id`, `error`.
6. For long jobs: `POST /v1/tasks/{task_id}/heartbeat` with `worker_id` before `lease_expires_at`.

### 4. Auth

- If **`ML_AIR_WORKER_TOKEN`** is set on the API: send `Authorization: Bearer <that token>` for lease/heartbeat/complete/fail. That token can lease tasks across tenants (service account).
- If it is **not** set: use a **maintainer** (or stronger) static/JWT token; lease results are filtered to that principal’s tenant and project scope.

### 5. Reference script

From the repo root (requires `psutil`; sends **Resource Usage Contract v1** on complete):

```bash
export MLAIR_API_BASE_URL=http://localhost:8080
export MLAIR_WORKER_TOKEN=your-worker-or-maintainer-token
export MLAIR_CAPABILITIES=app_etl_adapter,app_train_adapter
PYTHONPATH=. python scripts/external_worker_example.py
```

See [Resource Usage Contract v1](./resource-usage-contract-v1.md).

## Environment

| Variable | Service | Default | Meaning |
|----------|---------|---------|---------|
| `ML_AIR_TASK_EXECUTION_MODE` | API, scheduler | `internal` | `external` enables lease API and `QUEUED` tasks; scheduler does not push those tasks to Redis. |
| `ML_AIR_WORKER_TOKEN` | API only | (empty) | If set, Bearer must match for unconstrained worker lease (optional). |
| `ML_AIR_TASK_LEASE_SECONDS` | API | `30` | Lease TTL; heartbeat extends it. |
| `ML_AIR_LEASE_REAP_INTERVAL_SECONDS` | scheduler | `5` | How often expired leases are reset to `PENDING` and rescheduled. |

## Complete payload (metrics + artifacts)

```json
{
  "worker_id": "demo-worker-1",
  "metrics": {
    "mAP50": 0.91,
    "precision": 0.88,
    "recall": {"value": 0.84, "step": 10}
  },
  "artifacts": [
    {"path": "train/best.pt", "uri": "minio://models/run123/best.pt"},
    {"path": "eval/confusion_matrix.png", "uri": "minio://eval/run123/cm.png"}
  ]
}
```

Metric keys are stored as `{plugin}.{key}` (for example `app_train_adapter.mAP50`). Hub receives **`run.tracking.updated`** over realtime when complete/fail persists tracking.

## Streaming logs

While a task is **RUNNING** and leased by your `worker_id`, append lines to the **run log stream** (visible in Hub **Runner logs** and via `GET .../runs/{run_id}/logs`):

```http
POST /v1/tasks/{task_id}/logs
Authorization: Bearer <worker-or-maintainer-token>
Content-Type: application/json

{
  "worker_id": "demo-worker-1",
  "lines": [
    { "level": "INFO", "message": "epoch 1 loss=0.42" },
    { "level": "WARN", "message": "learning rate clipped" }
  ]
}
```

- Up to **100** lines per request; `message` required; `level` defaults to `INFO` (`DEBUG`, `WARN`, `ERROR` allowed).
- The API stores each line in Redis `mlair:logs:{run_id}` with payload `{ "task_id", "plugin", "worker_id" }` so the Hub can filter by task.
- Lease / complete / fail also write summary lines (leased, success, failed) with the same payload shape.
- Task-scoped read (maintainer/viewer token): `GET /v1/tenants/{tenant_id}/projects/{project_id}/tasks/{task_id}/logs`.

## API summary

| Method | Path | Body highlights |
|--------|------|-----------------|
| POST | `/v1/tasks/lease` | `worker_id`, `capabilities[]`, `max_tasks` |
| POST | `/v1/tasks/{task_id}/logs` | `worker_id`, `lines[]` with `level`, `message` |
| POST | `/v1/tasks/{task_id}/heartbeat` | `worker_id` |
| POST | `/v1/tasks/{task_id}/complete` | `worker_id`, `metrics`, `artifacts[]` (`path`, `uri`), or `artifact_uri?` |
| POST | `/v1/tasks/{task_id}/fail` | `worker_id`, `error` |

## Result

- Tasks: `PENDING` → `QUEUED` → `RUNNING` (leased) → `SUCCESS` or `FAILED`.
- Runs advance when the scheduler consumes `task_finished` events (same path as the internal executor).

## Done

- External worker documented; align `capabilities` with pipeline task `plugin` names (for example `app_train_adapter`).

## See also

- [Run a Pipeline](./run-pipeline.md)
- [Retry a Failed Task](./retry-failed-task.md)
- [Configure Tenant and Project Scope](./configure-tenant-project-scope.md)

Reference pattern: implement a small worker that calls **`POST /v1/tasks/lease`**, executes the returned `plugin` + `payload`, then **`POST /v1/tasks/{task_id}/complete`** or **`/fail`**. See this repo’s smoke scripts under `scripts/` for HTTP examples.
