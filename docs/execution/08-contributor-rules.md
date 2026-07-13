# Contributor Rules — Execution

**Document ID:** `docs/execution/08-contributor-rules.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

---

## Purpose

Prevent orchestration drift. PRs that change run/task semantics, lease contracts, or worker APIs must align with Package 003 freeze.

**Effective:** After Package 003 Design Freeze v1.0.

---

## Rule 1 — Classify configuration impact

| Change | Layer | Doc |
|--------|-------|-----|
| `ML_AIR_TASK_EXECUTION_MODE` | L3 deployment | [config/07-deployment-contract.md](../config/07-deployment-contract.md) |
| Lease TTL, reap interval, tick seconds | L1 tuning | This doc § L1 inventory |
| Replay require signed manifest | L4 policy | [governance/03-manifest-and-lineage.md](../governance/03-manifest-and-lineage.md) |
| Manifest signing keys | L3 secrets | [config/06-secret-management.md](../config/06-secret-management.md) |

New execution **policy** knobs → L4 schema + ADR. New **tuning** → L1 table below + no `.env.example` unless infra operator needs it.

---

## Rule 2 — State machine changes require doc + ADR

Before adding run/task statuses or transitions:

1. Update [02-state-machines.md](./02-state-machines.md)
2. Update `RUN_ALLOWED_TRANSITIONS` / `TASK_ALLOWED_TRANSITIONS` in `scheduler/main.py`
3. ADR if behavior is not backward compatible

**Forbidden:** silent new terminal states without scheduler enforcement.

---

## Rule 3 — Internal vs external mode parity

`ML_AIR_TASK_EXECUTION_MODE` must be **identical** on API and scheduler. PRs that branch on mode must update both paths and [01-architecture-overview.md](./01-architecture-overview.md) concurrency rules.

---

## Rule 4 — Worker API contract

Changes to lease / heartbeat / complete / fail payloads require:

- Update [05-external-workers.md](./05-external-workers.md)
- Update [guides/external-worker-execution.md](../guides/external-worker-execution.md)
- Backward-compatible defaults or versioned field names

---

## Rule 5 — Retry policy is shared

Backoff logic lives in `sdk/retry_policy.py` only. Scheduler must not duplicate formulas. Tests: `api/tests/test_retry_policy.py`.

---

## Rule 6 — Replay respects governance

Replay gating reads L4 via `app.settings.worker` when available; L1 env fallbacks are transitional (Config G3). See [governance/03-manifest-and-lineage.md](../governance/03-manifest-and-lineage.md).

---

## L1 tuning inventory (execution-owned)

| Key | Service | Default | Purpose |
|-----|---------|---------|---------|
| `ML_AIR_TASK_LEASE_SECONDS` | API | 30 | External lease TTL |
| `ML_AIR_LEASE_REAP_INTERVAL_SECONDS` | scheduler | 5 | Expired lease reap |
| `ML_AIR_TRIGGER_POLICY_TICK_SECONDS` | scheduler | 30 | Trigger policy tick |
| `ML_AIR_DATASET_MATERIALIZATION_TICK_SECONDS` | scheduler | 30 | Materialization tick |
| `ML_AIR_DATASET_MATERIALIZATION_TICK_LIMIT` | scheduler | 50 | Max scopes per tick |
| `ML_AIR_SCHEDULER_TICK_LOCK` | scheduler | 1 | Multi-replica tick lock |
| `ML_AIR_SCHEDULER_WORKER_ID` | scheduler | HOSTNAME | Lock identity |
| `ML_AIR_SCHEDULER_METRICS_PORT` | scheduler | 9102 | Prometheus |
| `ML_AIR_PLUGIN_TIMEOUT_SECONDS` | executor | 120 | Plugin subprocess |
| `ML_AIR_PLUGIN_RUNNER_MODULE` | executor | mlair_runner | Runner module |
| `ML_AIR_EXECUTOR_METRICS_PORT` | executor | 9103 | Prometheus |
| `ML_AIR_REFERENCE_TASK_SLEEP_MS` | executor | — | Demo stub only |

Event stream / OTel worker keys are owned by Configuration worker bridge — not duplicated here.

---

## PR checklist

```markdown
## Execution impact

- [ ] State machine doc updated (if statuses/transitions changed)
- [ ] Internal + external paths both handled
- [ ] Layer L_ declared for each new knob
- [ ] Worker API docs updated (if lease/complete contract changed)
- [ ] Retry uses sdk/retry_policy (no inline backoff)
- [ ] Package 003 freeze respected
```

---

## Sign-off commands (local)

```bash
PYTHONPATH=. python -m unittest api.tests.test_retry_policy
make verify-execution-signoff
make validate-scheduler-ha   # requires running stack
```
