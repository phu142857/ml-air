# Runbook: Readiness v2 Cutover

## Goal

Migrate from legacy aggregate readiness fallback to strict version-centric readiness safely.

Current default in code/config examples: **strict mode enabled** (`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`).

## Scope

- Dataset readiness endpoint:
  - `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness`
  - `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/readiness`
- Cutover guard:
  - `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK`

## Pre-cutover checklist

- Dataset pipelines are producing immutable versions (`vN`) continuously.
- Scheduled/manual materialization is active for runtime accumulation strategies.
- Dataset Hub shows expected latest versions and source badges.
- Readiness evaluations are present with `dataset_version_id` and `policy_id`.
- Scheduler metrics are available:
  - `mlair_scheduler_dataset_materialization_tick_evaluated_total`
  - `mlair_scheduler_dataset_materialization_tick_triggered_total`
  - `mlair_scheduler_dataset_materialization_tick_skipped_total{reason=...}`
- Optional DB race test passes in your environment:
  - `ML_AIR_RUN_DB_INTEGRATION_TESTS=1 python -m unittest -q api/tests/test_materialization_concurrency_db.py`

## Rollout plan

1. **Compatibility mode (temporary rollback mode)**
   - Set `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1`.
   - Observe readiness calls and ensure most requests resolve a real `dataset_version_id`.

2. **Dry-run verification**
   - For representative datasets, compare:
     - `GET .../datasets/{id}/readiness?policy_id=<id>`
     - `GET .../datasets/{id}/versions/{version_id}/readiness?policy_id=<id>`
   - Confirm eligibility status and reasons are consistent.

3. **Strict mode**
   - Set `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`.
   - Restart API service.
   - Legacy endpoint now returns `409 no_materialized_dataset_version` when no version exists.

4. **Post-cutover validation**
   - Verify no high-volume `409 no_materialized_dataset_version` in API logs.
   - Verify scheduled/manual materialization keeps new versions flowing.
   - Verify training flows still use pinned `dataset_version_id`.

## Monitoring checklist

- API error rate for readiness endpoints:
  - track `409 no_materialized_dataset_version`.
- Scheduler materialization health:
  - trigger count increases periodically.
  - skipped reasons are mostly expected (e.g. `below_threshold_guard`).
- Dataset Hub operational checks:
  - accumulation strategy/threshold visible.
  - latest version updates after materialization tick.
  - readiness evaluations appended with policy/version references.

## Rollback

If strict mode causes operational disruption:

1. Set `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1`.
2. Restart API service.
3. Keep materialization scheduler enabled and fix datasets missing versions.
4. Re-attempt cutover after readiness and version coverage are stable.

## Done criteria

- Strict mode enabled (`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`) in target environments.
- No sustained `no_materialized_dataset_version` errors.
- Training and readiness workflows are fully version-centric.
