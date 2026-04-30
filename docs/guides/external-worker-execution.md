# External worker execution (pull / lease)

## Goal

Run pipeline tasks **outside** the built-in Redis executor: an external process (for example Vet-AI) **leases** work from MLAir, executes it, then calls **complete** or **fail**. MLAir remains the source of truth for run and task status.

## When to use this

- You want **async, distributed** execution without embedding business HTTP calls inside MLAir.
- Workers scale independently; MLAir keeps **orchestration + scheduling + DB state**.

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

Create a run through the normal API (for example Vet-AI triggering MLAir). Tasks that become ready enter **`QUEUED`** with a **`plugin`** name taken from `config_snapshot.tasks[].plugin`.

### 3. Implement the worker loop

1. `POST /v1/tasks/lease` with `worker_id`, `capabilities` (plugin names you implement), `max_tasks`.
2. For each leased task: run your logic (train, ETL, etc.).
3. On success: `POST /v1/tasks/{task_id}/complete` with `worker_id`, optional `metrics`, `artifact_uri`.
4. On failure: `POST /v1/tasks/{task_id}/fail` with `worker_id`, `error`.
5. For long jobs: `POST /v1/tasks/{task_id}/heartbeat` with `worker_id` before `lease_expires_at`.

### 4. Auth

- If **`ML_AIR_WORKER_TOKEN`** is set on the API: send `Authorization: Bearer <that token>` for lease/heartbeat/complete/fail. That token can lease tasks across tenants (service account).
- If it is **not** set: use a **maintainer** (or stronger) static/JWT token; lease results are filtered to that principal’s tenant and project scope.

### 5. Reference script

From the repo root:

```bash
export MLAIR_API_BASE_URL=http://localhost:8080
export MLAIR_WORKER_TOKEN=your-worker-or-maintainer-token
export MLAIR_CAPABILITIES=app_etl_adapter,app_train_adapter
python scripts/external_worker_example.py
```

## Environment

| Variable | Service | Default | Meaning |
|----------|---------|---------|---------|
| `ML_AIR_TASK_EXECUTION_MODE` | API, scheduler | `internal` | `external` enables lease API and `QUEUED` tasks; scheduler does not push those tasks to Redis. |
| `ML_AIR_WORKER_TOKEN` | API only | (empty) | If set, Bearer must match for unconstrained worker lease (optional). |
| `ML_AIR_TASK_LEASE_SECONDS` | API | `30` | Lease TTL; heartbeat extends it. |
| `ML_AIR_LEASE_REAP_INTERVAL_SECONDS` | scheduler | `5` | How often expired leases are reset to `PENDING` and rescheduled. |

## API summary

| Method | Path | Body highlights |
|--------|------|-----------------|
| POST | `/v1/tasks/lease` | `worker_id`, `capabilities[]`, `max_tasks` |
| POST | `/v1/tasks/{task_id}/heartbeat` | `worker_id` |
| POST | `/v1/tasks/{task_id}/complete` | `worker_id`, `metrics`, `artifact_uri?` |
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

Reference worker (leases tasks, runs continuous training, completes with metrics): **Vet-AI** repo — enable `VETAI_MLAIR_WORKER_ENABLED` and see its README section *External MLAir worker*.
