# Plugin Runtime (Internal Executor)

**Document ID:** `docs/execution/04-plugin-runtime.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

---

## Purpose

How pipeline tasks execute when `ML_AIR_TASK_EXECUTION_MODE=internal`.

**Code:** `executor/`, `mlair_runner.py`, `sdk/http_task_contract.py`

---

## Dispatch path

```text
Scheduler → Redis (priority queue) → Executor BLPOP → execute → task_finished → Scheduler
```

Queues: `mlair:tasks:high`, `mlair:tasks:default`, `mlair:tasks:low` (from run `priority`).

---

## Task kinds

| Config signal | Executor behavior |
|---------------|-------------------|
| `plugin` name set | Subprocess: `python -m mlair_runner <plugin>` or `ML_AIR_PLUGIN_RUNNER_MODULE` |
| HTTP task block | Outbound HTTP per `sdk/http_task_contract` |
| Neither | Sleep stub (demo only) |

Pipeline step identity: `config_snapshot.tasks[].id` + `plugin`.

---

## Resource usage

Executor samples process tree (psutil / optional NVML) and attaches usage to `task_finished`. Hub metrics/artifacts populated on complete.

External workers must send usage explicitly — see [Resource Usage Contract v1](../guides/resource-usage-contract-v1.md).

---

## HTTP tasks in external mode

HTTP-defined steps may still use the internal Redis path while plugin tasks use lease APIs. See [http-pipeline-tasks](../guides/http-pipeline-tasks.md).

---

## Non-goals (v0.1)

- OCI / container-per-task isolation spec
- GPU scheduling plugin
