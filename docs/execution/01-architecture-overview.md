# Execution Architecture Overview

**Document ID:** `docs/execution/01-architecture-overview.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

---

## Components

```text
API          Run create, cancel, worker lease APIs, idempotency
Scheduler    DAG scheduling, Redis dispatch (internal), lease reap, ticks
Executor     Redis consumer; plugin subprocess / HTTP / stub (internal mode)
Workers      External lease loop (external mode)
Postgres     runs, tasks — source of truth
Redis        mlair:runs:new, mlair:tasks:*, tick locks, task_finished
```

---

## Execution modes

Controlled by **`ML_AIR_TASK_EXECUTION_MODE`** (L3 deployment contract; same value on API + scheduler).

| Mode | Ready task status | Dispatch |
|------|-------------------|----------|
| `internal` (default) | `RUNNING` | Redis `RPUSH` → executor |
| `external` | `QUEUED` | Worker `POST /v1/tasks/lease` |

See [task-execution-mode](../concepts/task-execution-mode.md) and [05-external-workers.md](./05-external-workers.md).

---

## Scheduler HA (Wave 1)

| Concern | Mechanism |
|---------|-----------|
| Run queue | Multiple replicas `BLPOP` `mlair:runs:new` |
| Periodic ticks | Redis lock `mlair:scheduler:tick-lock:*` (`ML_AIR_SCHEDULER_TICK_LOCK=1`) |
| Lease reap | Each replica may reap; idempotent `RUNNING` → `PENDING` |

---

## Policy vs tuning

| Class | Examples | Layer |
|-------|----------|-------|
| **Tuning** | `ML_AIR_TASK_LEASE_SECONDS`, `ML_AIR_LEASE_REAP_INTERVAL_SECONDS`, tick intervals | L1 (env, code defaults) |
| **Governance** | Replay require signed manifest, artifact evidence | L4 via `app.settings.worker` |
| **Secrets** | Worker SA secrets, `ML_AIR_WORKER_TOKEN` | L3 |

Package **002** owns layer rules; Package **003** owns orchestration semantics.

---

## Related

- [02-state-machines.md](./02-state-machines.md)
- [03-lease-and-retry.md](./03-lease-and-retry.md)
- [08-contributor-rules.md](./08-contributor-rules.md)
- [09-migration-strategy.md](./09-migration-strategy.md)
- [governance/03-manifest-and-lineage.md](../governance/03-manifest-and-lineage.md)
- [guides/external-worker-execution.md](../guides/external-worker-execution.md)
