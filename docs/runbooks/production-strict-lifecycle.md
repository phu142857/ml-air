# Runbook: Production / staging strict lifecycle config

## Goal

**Lifecycle OS** = MLAir is the **source of truth** for dataset version, readiness, `run_id`, promote, and lineage — not a Hub UI beside Airflow/MLflow glue.

Staging and production must use the **same documented env contract** (no “works on my laptop” drift). Dev may relax individual levers; **prod/staging must not** without a ticketed rollback and re-cutover date ([legacy-compat-sunset](./legacy-compat-sunset.md)).

## Required env (staging + production)

Copy [`deploy/env/staging-strict.env.example`](../../deploy/env/staging-strict.env.example) or [`deploy/env/production-strict.env.example`](../../deploy/env/production-strict.env.example) into your secret manager / Helm values. After deploy, verify **`GET /v1/runtime-config` → `features`**.

| Variable | Staging / prod value | `runtime-config.features.*` |
| --- | --- | --- |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED` | **`1`** | `strict_dataset_version_required: true` |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS` | **`1`** | `strict_dataset_version_all_post_runs: true` |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` | **`0`** | `readiness_allow_legacy_fallback: false` |
| `ML_AIR_WARN_IMPLICIT_DATASET_HEAD` | **`1`** (observe) → **`0`** after M1 sign-off | _(log-only; not in features)_ |
| `ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL` | **`0`** | _(lineage uses monotonic `vN`)_ |
| `ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS` | **`0`** default; **`1`** when all pipelines declare inputs | _(orchestration guard)_ |

**Train / Run contract:** `POST .../runs/trigger` and Hub **Train with model** must send **`dataset_version_id`** (Head snapshot `vN` or explicit id). Generic `POST .../runs` without a pin is allowed **only** for pipelines with **no** declared dataset readiness inputs — document each exception in your pipeline catalog ([dataset-version-immutability § exceptions](../api/dataset-version-immutability.md)).

Realtime is **always on** in current Hub/API builds (no `MLAIR_REALTIME_ENABLED` lever). Set `ML_AIR_RUNTIME_REALTIME_BASE_URL` to the browser-reachable **WSS** URL ([production-wss-ingress](./production-wss-ingress.md)).

## Forbidden in prod (except bounded rollback)

| Lever | Why off |
| --- | --- |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1` | Implicit latest-head + aggregate readiness — breaks version-centric audits |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0` | Silent “latest version” on trigger — breaks reproducibility |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=0` | Unless catalogued non-dataset pipelines still need unpinned generic runs |

Rollback window: **≤ 14 days**, incident ticket required, re-cutover date recorded in [legacy-compat-sunset](./legacy-compat-sunset.md).

## Deploy checklist

1. [ ] API + scheduler env match table above (restart after change).
2. [ ] `curl -sS "$BASE/v1/runtime-config" | jq '.features | {strict_dataset_version_required, strict_dataset_version_all_post_runs, readiness_allow_legacy_fallback}'` — all strict as expected.
3. [ ] Hub **Dataset Hub → Run / Train** shows pinned version; no silent “latest” on train.
4. [ ] Automation / CI uses `POST .../runs/trigger` with `dataset_version_id` ([integrate-external-executor](../guides/integrate-external-executor.md)).
5. [ ] No sustained `422 DATASET_VERSION_REQUIRED` from unknown clients (grep API logs 24h post-cutover).
6. [ ] Wave 0 realtime sign-off on same env ([signoff-wave0-wave1-phase9](./signoff-wave0-wave1-phase9.md)).

## Dev vs prod

| Concern | Dev (local quickstart) | Staging / prod |
| --- | --- | --- |
| Strict pins | Same defaults in `docker-compose.quickstart.yml` | **Must** match this runbook |
| Legacy fallback | Do not set `=1` in shared `.env` committed to repo | **Never** without rollback ticket |
| Parallel glue | E2 Airflow+MLflow lab OK for **benchmark only** | **Not** daily ops |

## References

- [Legacy compatibility sunset](./legacy-compat-sunset.md) — milestone calendar + M1 sign-off
- [Dataset version immutability](../api/dataset-version-immutability.md)
- [Readiness and gating](../api/readiness-and-gating.md)
- [Hub lifecycle-first UX](../guides/hub-lifecycle-first.md)
