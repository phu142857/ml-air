# External Workers

**Document ID:** `docs/execution/05-external-workers.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

---

## Purpose

Contract for workers that pull tasks via lease API while MLAir remains source of truth.

**Operator guide:** [external-worker-execution](../guides/external-worker-execution.md)

---

## Prerequisites

1. Migration `0011_task_external_worker_lease`
2. `ML_AIR_TASK_EXECUTION_MODE=external` on API + scheduler
3. Service Account with lease scope (or legacy `ML_AIR_WORKER_TOKEN`)

---

## Worker loop

```text
while true:
  tasks = POST /v1/tasks/lease { worker_id, capabilities, max_tasks }
  for task in tasks:
    optionally POST .../logs
    optionally POST .../heartbeat  (before lease_expires_at)
    on success: POST .../complete { metrics, artifacts, resource_usage }
    on failure: POST .../fail { error }
```

`capabilities` must include the task `plugin` name.

---

## Payload highlights

Leased task includes `plugin`, `plugin_context` (model/dataset pins from API), `config_snapshot`, run metadata.

Model-centric runs from `POST .../runs/trigger` ship resolved `plugin_context` — see [model-centric pipeline mapping](../guides/model-centric-pipeline-mapping-and-trigger.md).

---

## Auth matrix

| Principal | Scope |
|-----------|-------|
| Service Account secret | Tenant/project bound to SA |
| `ML_AIR_WORKER_TOKEN` | Global worker (optional L3) |
| Human JWT | Editor+ in task tenant/project |

---

## Reference implementation

`scripts/external_worker_example.py` — lease loop with Resource Usage Contract v1 on complete.

---

## Non-goals (v0.1)

- Worker registration / discovery service
- Bidirectional gRPC streaming
