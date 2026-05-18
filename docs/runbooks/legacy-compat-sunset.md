# Runbook: Legacy compatibility sunset (Wave 0b)

## Goal

Move all environments to **version-centric** dataset and readiness behavior, with a **bounded** window for legacy implicit “latest head” resolution.

**In-repo default today:** strict readiness (`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`), strict trigger pin (`ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`), declared-inputs-only for generic `POST .../runs` unless `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1`.

## Product-owned calendar (fill per org)

There is **no fixed global sunset date** in this repository. Copy the table into your change ticket and set dates:

| Milestone | Owner | Target date (your org) | Environment |
| --- | --- | --- | --- |
| **T0 — Baseline** | Platform | _YYYY-MM-DD_ | Staging + prod inventory of clients omitting `dataset_version_id` |
| **T+30d — Staging strict** | Platform | _YYYY-MM-DD_ | Staging: `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0` (already default), `ML_AIR_WARN_IMPLICIT_DATASET_HEAD=1`, grep logs |
| **T+60d — Prod strict readiness** | Product + Platform | _YYYY-MM-DD_ | Prod: legacy fallback **off**; rollback only via runbook |
| **T+90d — Optional blanket pin** | Product | _YYYY-MM-DD_ | Prod: evaluate `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1` if all train paths must pin |
| **T+120d — Legacy off** | Product | _YYYY-MM-DD_ | Remove `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1` from all env files; document in release notes |

Adjust spacing for your release train; do not enable `ALL_POST_RUNS` until non-dataset pipelines are catalogued.

## Pre-sunset checklist

- [ ] Dataset Hub pins **Head snapshot (vN)** / explicit `dataset_version_id` on Train and Run.
- [ ] Automation (`POST .../runs/trigger`, scheduler) sends pins where required.
- [ ] `GET /v1/runtime-config` → `features.readiness_allow_legacy_fallback` is `false` in target env.
- [ ] No sustained **`422 DATASET_VERSION_REQUIRED`** from unknown clients (see API logs).
- [ ] Materialization produces `vN` rows on schedule ([readiness-v2-cutover](./readiness-v2-cutover.md)).
- [ ] Execution realtime sign-off passed ([execution-realtime-ops](./execution-realtime-ops.md)).

## Rollout steps

1. **Observe (T0):** `ML_AIR_WARN_IMPLICIT_DATASET_HEAD=1` in staging; fix callers that still omit version id.
2. **Staging strict (T+30d):** Follow [readiness-v2-cutover](./readiness-v2-cutover.md) § Rollout plan steps 3–4.
3. **Production (T+60d):** Same with change window; monitor `mlair_readiness_blocked_total`, `mlair_eligibility_denied_total`.
4. **Optional blanket (T+90d):** Enable `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1` only after pipeline audit — see [Dataset version immutability](../api/dataset-version-immutability.md).

## Rollback (bounded)

| Lever | When |
| --- | --- |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1` | Emergency: implicit latest-head on readiness/eligibility |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0` | Emergency: trigger may resolve latest version (not recommended long-term) |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=0` | Undo blanket pin only |

Restart API after env changes. Document rollback in incident ticket; set a **re-cutover date** within 14 days.

## Done criteria

- Target environments: `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0` with no rollback for ≥ 30 days.
- Train and evaluate paths pass audit with explicit `dataset_version_id`.
- ROADMAP Phase 1 sunset line can be marked complete in your org’s fork/release notes (calendar date recorded externally).

## References

- [Dataset version immutability](../api/dataset-version-immutability.md) — levers and implicit-resolution audit
- [Readiness and gating](../api/readiness-and-gating.md) — canonical codes and strict mode
