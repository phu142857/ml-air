# Execution Migration Strategy

**Document ID:** `docs/execution/09-migration-strategy.md`  
**Series:** 003 Execution Architecture  
**Status:** Frozen v1.0

---

## Phase E0 — Inventory (2026-07-13)

Mapped live orchestration to documentation baseline.

| Area | As-is |
|------|-------|
| State machines | `scheduler/main.py` transition tables |
| Modes | `internal` / `external` via L3 env |
| Lease | DB columns + reap tick |
| Retry | Per-task row + `sdk/retry_policy` |
| Replay | `replay_of_run_id`, `replay_from_task_id` + governance gates |
| Worker policy | `app.settings.worker` bridge (Config G1) |

---

## Phase E1 — Semantic freeze (2026-07-13) ✅

- [02-state-machines.md](./02-state-machines.md) — transition tables from scheduler
- [03-lease-and-retry.md](./03-lease-and-retry.md) — lease + retry + DLQ
- [08-contributor-rules.md](./08-contributor-rules.md) — L1 inventory + PR gates
- [DESIGN-FREEZE.md](./DESIGN-FREEZE.md) closed v1.0

---

## Phase E2 — L1 tuning catalog (2026-07-13) ✅

Documented in [08-contributor-rules.md](./08-contributor-rules.md) § L1 inventory.

---

## Phase E3 — Test gate (2026-07-13) ✅

| Test area | Command |
|-----------|---------|
| Execution signoff bundle | `make verify-execution-signoff` |
| Retry backoff | `api/tests/test_retry_policy.py` |
| Worker settings | `api/tests/test_worker_settings_unit.py` (container) |
| Worker tracking | `api/tests/test_worker_task_tracking.py` (container) |
| Scheduler HA | `make validate-scheduler-ha` |
| DLQ / cancel integration | `scripts/verify_dlq_cancel_integration.py` (live; skipped if API down) |

---

## Definition of done (v1.0 freeze)

1. DESIGN-FREEZE entry criteria checked
2. Guides cross-link to frozen docs (no contradictory semantics)
3. CI lists execution sign-off commands (parallel to identity signoff)
