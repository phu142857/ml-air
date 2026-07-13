# Run and Task State Machines

**Document ID:** `docs/execution/02-state-machines.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

**Code:** `scheduler/main.py` — `RUN_ALLOWED_TRANSITIONS`, `TASK_ALLOWED_TRANSITIONS`

---

## Run states

| Status | Meaning |
|--------|---------|
| `PENDING` | Created; waiting for scheduler |
| `RUNNING` | At least one task active or queued |
| `SUCCESS` | All selected tasks succeeded |
| `FAILED` | Terminal failure (task or operator) |
| `CANCELLED` | Operator or dependency cancellation |

### Allowed transitions

```text
PENDING   → RUNNING | FAILED | CANCELLED
RUNNING   → SUCCESS | FAILED | CANCELLED
FAILED    → RUNNING          (retry whole run — rare path)
SUCCESS   → (terminal)
CANCELLED → (terminal)
```

Run completion: when every task in the **replay-selected** DAG subset is `SUCCESS`, scheduler sets run `SUCCESS`. Any selected task `FAILED` without retry schedules run `FAILED`.

---

## Task states

| Status | Meaning |
|--------|---------|
| `PENDING` | Waiting on dependencies or concurrency slot |
| `QUEUED` | Ready; external mode — awaiting lease |
| `RUNNING` | Executing (internal Redis or external lease) |
| `RETRY` | Backoff window before re-dispatch |
| `SUCCESS` | Terminal success |
| `FAILED` | Terminal failure (retries exhausted) |
| `CANCELLED` | Run cancel or unreachable downstream |

### Allowed transitions

```text
PENDING → RUNNING | QUEUED | FAILED | SUCCESS | CANCELLED
QUEUED  → RUNNING | FAILED | CANCELLED
RUNNING → SUCCESS | FAILED | PENDING | CANCELLED
FAILED  → RETRY
RETRY   → RUNNING | QUEUED | CANCELLED
SUCCESS → (terminal)
CANCELLED → (terminal)
```

`RUNNING → PENDING` occurs when an **external lease expires** (lease reaper).

---

## DAG scheduling

1. Build plan from `config_snapshot.tasks[]` (`id`, `depends_on`) or legacy `steps`.
2. **Replay filter:** `replay_from_task_id` limits the selected subgraph.
3. Schedule when all dependencies are `SUCCESS` and project concurrency allows (`max_parallel_tasks`).
4. On dependency `FAILED`/`CANCELLED`, pending downstream tasks → `CANCELLED`.

---

## Cancellation

| Action | Effect |
|--------|--------|
| API cancel run | Run `CANCELLED`; pending-like tasks `CANCELLED` |
| Failed upstream | Downstream pending tasks `CANCELLED` (unreachable) |

`CANCELED` (US spelling) accepted at API boundary; stored as `CANCELLED`.

---

## Concurrency counting

| Mode | Slots consumed by |
|------|-------------------|
| Internal | Tasks `RUNNING` |
| External | Tasks `QUEUED` + `RUNNING` |

Run must be `PENDING` or `RUNNING` for tasks to count against project limit.

---

## Non-goals (v0.1)

- Formal TLA+ model
- Per-task pause/resume state
