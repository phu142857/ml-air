# Execution Architecture — Design Package v1.0

**Series:** 003 Execution Architecture  
**Status:** **CLOSED** (v1.0 — 2026-07-13)  
**Depends on:** [002 Configuration](../config/DESIGN-FREEZE.md) · [004 Governance](../governance/DESIGN-FREEZE.md) · [001 Identity](../iam/DESIGN-FREEZE.md)

---

## Purpose

Freeze scheduler, executor, lease, retry, cancellation, and replay semantics so execution behavior does not churn with feature PRs. Package 004 fixed governance gates on replay; Package 003 owns **orchestration state machines** and **worker contracts**.

---

## Scope (v1.0)

| Domain | Layer | Code anchor |
|--------|-------|-------------|
| Run / task state machines | L1 transitions | `scheduler/main.py` |
| Internal vs external execution | L3 `ML_AIR_TASK_EXECUTION_MODE` | scheduler, executor, `worker_task_service.py` |
| Lease / heartbeat | L1 TTL + reap interval | `worker_task_service.py`, scheduler lease reaper |
| Retry / DLQ | L1 per-task `max_attempts`, `backoff_ms` | `sdk/retry_policy.py`, scheduler |
| Cancellation | API + scheduler | `run_service.py`, `_cancel_tasks_for_run` |
| Replay | Run metadata + governance gates | `run_service.create_run`, scheduler replay filter |
| Plugin runtime | executor subprocess / HTTP | `executor/`, `sdk/http_task_contract.py` |

**Non-goals (v1.0):** multi-region scheduler HA redesign, Kubernetes Job executor, sandbox isolation spec.

---

## Artifacts

| Doc | Status |
|-----|--------|
| [01-architecture-overview.md](./01-architecture-overview.md) | Frozen v1.0 |
| [02-state-machines.md](./02-state-machines.md) | Frozen v1.0 |
| [03-lease-and-retry.md](./03-lease-and-retry.md) | Frozen v1.0 |
| [04-plugin-runtime.md](./04-plugin-runtime.md) | Frozen v1.0 |
| [05-external-workers.md](./05-external-workers.md) | Frozen v1.0 |
| [08-contributor-rules.md](./08-contributor-rules.md) | Frozen v1.0 |
| [09-migration-strategy.md](./09-migration-strategy.md) | Frozen v1.0 |

---

## Entry criteria (v1.0) — met

- [x] Run and task transition tables match `scheduler/main.py` enforcement — [02](./02-state-machines.md)
- [x] Internal vs external mode + concurrency counting — [02](./02-state-machines.md)
- [x] Lease reap + heartbeat contract aligned with [external-worker guide](../guides/external-worker-execution.md) — [03](./03-lease-and-retry.md)
- [x] Retry/DLQ behavior + test inventory — [03](./03-lease-and-retry.md), [09](./09-migration-strategy.md)
- [x] Replay partial-run semantics aligned with [governance/03](../governance/03-manifest-and-lineage.md) — [02](./02-state-machines.md)
- [x] L1 tuning keys inventoried — [08](./08-contributor-rules.md)

---

## Post-freeze work (not blocking v1.0)

- DLQ / cancel propagation integration tests
- Kubernetes Job executor (out of scope v1.0)

---

*Frozen v1.0. Material changes require ADR + version bump.*
