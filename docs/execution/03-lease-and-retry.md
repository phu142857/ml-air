# Lease and Retry

**Document ID:** `docs/execution/03-lease-and-retry.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

---

## External lease (pull workers)

**Code:** `api/app/domains/orchestration/worker_task_service.py`, scheduler `_requeue_expired_leases`

### Lifecycle

```text
QUEUED ──lease──► RUNNING ──heartbeat──► (extends lease_expires_at)
                    │
         complete/fail ──► SUCCESS / FAILED
                    │
         lease TTL expired ──► PENDING (reaper) ──► reschedule QUEUED/RUNNING
```

| Parameter | Env | Default |
|-----------|-----|---------|
| Lease TTL | `ML_AIR_TASK_LEASE_SECONDS` | 30s (min 5) |
| Reap interval | `ML_AIR_LEASE_REAP_INTERVAL_SECONDS` | 5s |

Lease SQL requires: task `QUEUED`, run `RUNNING`, matching `capabilities` (plugin names), principal scope.

### APIs

| Method | Path |
|--------|------|
| `POST` | `/v1/tasks/lease` |
| `POST` | `/v1/tasks/{id}/heartbeat` |
| `POST` | `/v1/tasks/{id}/complete` |
| `POST` | `/v1/tasks/{id}/fail` |
| `POST` | `/v1/tasks/{id}/logs` |

Auth: Service Account Bearer (preferred), `ML_AIR_WORKER_TOKEN`, or editor+ JWT.

---

## Internal mode

Lease APIs return **empty** when `ML_AIR_TASK_EXECUTION_MODE != external`. Tasks skip `QUEUED` and go directly `RUNNING` on Redis dispatch.

---

## Retry policy

Per-task columns: `max_attempts` (default **3**), `backoff_ms` (default **1000**).

**Code:** `sdk/retry_policy.py`, scheduler `task_finished` handler.

| Function | Rule |
|----------|------|
| `should_schedule_retry` | `current_attempt < max_attempts` |
| `compute_retry_delay_seconds` | `backoff_ms × 2^(attempt-1)` seconds |
| `next_retry_attempt` | `current_attempt + 1` |

On failure with retries remaining:

1. Task → `RETRY`, increment `attempt`
2. Sleep backoff in scheduler loop
3. Re-enqueue `task_ready` event (internal Redis or external path)

When retries exhausted: payload pushed to Redis **`mlair:tasks:dlq`**; run may → `FAILED`.

---

## Idempotency

- **Runs:** `idempotency_key` per tenant/project returns existing run on duplicate create.
- **Complete/fail:** Must match `leased_by` worker_id and task `RUNNING`.

---

## Non-goals (v0.1)

- Distributed lease fencing tokens
- Cross-datacenter lease migration
