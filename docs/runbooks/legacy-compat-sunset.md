# Runbook: Legacy compatibility sunset (Wave 0b / Lifecycle OS)

## Goal

Move all environments to **version-centric** dataset and readiness behavior. **Lifecycle OS** means MLAir is the **source of truth** for version, readiness, `run_id`, promote, and lineage — not “Hub UI + Airflow/MLflow glue.”

**In-repo default today (M0 — shipped):**

- `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`
- `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`
- `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1` (set `0` only for catalogued non-dataset pipelines)
- `ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL=0`

Prod/staging **must** match [`production-strict-lifecycle.md`](./production-strict-lifecycle.md) and [`deploy/env/*-strict.env.example`](../../deploy/env/).

---

## Milestone calendar

Suggested dates for a **2026 Q2** cutover (adjust per org release train). Copy into your change ticket.

| ID | Milestone | Owner | Target date | Status (repo / org) |
| --- | --- | --- | --- | --- |
| **M0** | **In-repo strict defaults** | Platform | **2026-06-02** | **[x] Shipped** — compose defaults, contract tests, Hub Head snapshot |
| **M1** | **Staging strict + observe** | Platform | **2026-06-02 → 2026-07-01** | **[ ] Operator** — apply `staging-strict.env`, `WARN_IMPLICIT=1`, 4 weeks no rollback |
| **M2** | **Production strict readiness** | Product + Platform | **2026-07-15** | **[ ] Operator** — prod env file, change window, monitor blocked/denied metrics |
| **M3** | **Prod blanket pin audit** | Product | **2026-08-01** | **[ ] Operator** — confirm `ALL_POST_RUNS=1` or document pipeline exceptions |
| **M4** | **Legacy levers removed from env repos** | Product | **2026-09-01** | **[ ] Operator** — no `READINESS_ALLOW_LEGACY_FALLBACK=1` in git/env; release note |

**M1 done when:** staging runs **`production-strict`** env ≥ **28 days** with **zero** rollback of legacy levers and **no unexplained** sustained `422 DATASET_VERSION_REQUIRED` (see sign-off below).

---

## M1 sign-off record (staging strict)

| Field | Value |
| --- | --- |
| Environment | _staging_ |
| Strict env source | _e.g. `deploy/env/staging-strict.env.example` @ git SHA_ |
| `runtime-config` snapshot date | _YYYY-MM-DD_ |
| `readiness_allow_legacy_fallback` | _must be `false`_ |
| `strict_dataset_version_required` | _must be `true`_ |
| `strict_dataset_version_all_post_runs` | _must be `true`_ (or documented exceptions) |
| Staging strict start date | _YYYY-MM-DD_ |
| 28-day window end | _YYYY-MM-DD_ |
| Incidents / rollbacks | _none / ticket #_ |
| Operator | _name_ |

**ROADMAP flip:** Phase 18 — M1 complete when the row above is filled and 28-day window passes.

---

## Pre-sunset checklist

- [ ] Dataset Hub pins **Head snapshot (vN)** / explicit `dataset_version_id` on Train and Run.
- [ ] Automation (`POST .../runs/trigger`, scheduler) sends pins where required.
- [ ] `GET /v1/runtime-config` → `features.readiness_allow_legacy_fallback` is `false` in target env.
- [ ] No sustained **`422 DATASET_VERSION_REQUIRED`** from unknown clients (see API logs).
- [ ] Materialization produces `vN` rows on schedule ([readiness-v2-cutover](./readiness-v2-cutover.md)).
- [ ] Execution realtime sign-off passed ([execution-realtime-ops](./execution-realtime-ops.md)).
- [ ] Paper/docs split MLAir path vs E2 baseline.

---

## Rollout steps

1. **M0 (done in git):** Defaults + tests + Hub UX; quickstart compose matches strict table.
2. **M1 — Staging strict:** Apply [`deploy/env/staging-strict.env.example`](../../deploy/env/staging-strict.env.example); `ML_AIR_WARN_IMPLICIT_DATASET_HEAD=1`; grep logs for implicit-head warnings; fix callers omitting `dataset_version_id`.
3. **M1 — Observe 28d:** Follow [readiness-v2-cutover](./readiness-v2-cutover.md) § Rollout plan steps 3–4; fill M1 sign-off table.
4. **M2 — Production:** Apply [`deploy/env/production-strict.env.example`](../../deploy/env/production-strict.env.example); monitor `mlair_readiness_blocked_total`, `mlair_eligibility_denied_total`.
5. **M3 — Pipeline audit:** List pipelines allowed to use unpinned generic `POST .../runs`; all others must declare inputs or stay under `ALL_POST_RUNS=1` ([dataset-version-immutability](../api/dataset-version-immutability.md)).
6. **M4 — Env hygiene:** Remove legacy `=1` from all deployment repos; document in release notes.

---

## Documented exceptions (generic `POST .../runs` without pin)

Allowed **only** when **both**:

1. `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=0` **or** pipeline has **no** declared dataset readiness inputs, **and**
2. Pipeline is **catalogued** in your org registry with owner + reason (e.g. pure infra smoke, no dataset).

Default prod posture: **`ALL_POST_RUNS=1`** — exceptions are rare and ticketed.

---

## Rollback (bounded)

| Lever | When |
| --- | --- |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1` | Emergency: implicit latest-head on readiness/eligibility |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0` | Emergency: trigger may resolve latest version (not recommended long-term) |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=0` | Undo blanket pin only |

Restart API after env changes. Document rollback in incident ticket; set a **re-cutover date** within **14 days**.

---

## Done criteria (section “Xong khi”)

- [x] **Prod config documented** — [`production-strict-lifecycle.md`](./production-strict-lifecycle.md) + `deploy/env/*-strict.env.example`
- [ ] **M1 executed** — staging strict ≥ 28 days, sign-off table filled (**operator**)
- [x] **Case study split documented** (MLAir path vs E2 baseline)
- [ ] **No parallel glue in ops runbooks** — operator paths use Hub `run_id` only (**operator** audit of internal runbooks)

---

## References

- [Production strict lifecycle](./production-strict-lifecycle.md)
- [Dataset version immutability](../api/dataset-version-immutability.md)
- [Readiness and gating](../api/readiness-and-gating.md)
- [Sign-off Wave 0 / 1](./signoff-wave0-wave1-phase9.md) — Wave 0b items
