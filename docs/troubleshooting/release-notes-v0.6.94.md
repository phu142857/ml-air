# MLAir v0.6.94 Release Notes

## What

- Add backend-first scope bootstrap surfaces: `GET /v1/runtime-config`, `GET /v1/bootstrap/context`, `POST|DELETE /v1/auth/context/switch`, and `GET /v1/auth/scope-decision`.
- Persist user scope overrides in DB (`auth_scope_context_overrides`) with optional TTL and stale mapping-version guard.
- Add operator production polish:
  - admin inspect API: `GET /v1/auth/scope-context/{subject}`
  - decision telemetry metric: `mlair_scope_decisions_total` (decision + reason + tenant + project labels)
  - regression tests for phase-3 scope flows.

## Why

- Remove client-only scope drift and make control-plane mapping the source of truth.
- Improve operational debugging for scope/auth mapping failures.
- Reduce misconfiguration incidents with explicit stale checks and reset flow.

## Risk

- Migration required: `0019_scope_context_state`.
- `mapping_version_stale` can appear more often if frontend keeps long-lived stale bootstrap cache.
- Admin inspect endpoint is intentionally restricted to admin principals.

## Env Changes

- New runtime/scope envs (optional but recommended):
  - `ML_AIR_ENVIRONMENT`
  - `ML_AIR_DEFAULT_TENANT`
  - `ML_AIR_DEFAULT_PROJECT`
  - `ML_AIR_RUNTIME_API_BASE_URL`
  - `ML_AIR_RUNTIME_REALTIME_BASE_URL`
  - `ML_AIR_FRONTEND_VERSION`
  - `ML_AIR_FRONTEND_COMMIT`
  - `ML_AIR_FEATURE_DATASET_HUB_V2`
  - `ML_AIR_FEATURE_SCOPE_DEBUG_PANEL`
  - `ML_AIR_SCOPE_OVERRIDE_TTL_SECONDS`
