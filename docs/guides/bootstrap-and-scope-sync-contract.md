# Bootstrap and Scope Sync Contract

Goal: make tenant/project scope resolution source-of-truth first, runtime configurable, and operator-friendly.

## Why this contract exists

Without a shared bootstrap contract, frontend scope can drift from backend mapping, causing empty-state UX and hard-to-debug auth/scope failures. This guide defines one canonical flow for:

- frontend startup scope
- runtime config injection after image publish
- scope switch validation and persistence
- operator debug trace for access denials
- downstream app integration for sync

## Canonical startup flow

1. User opens UI.
2. Frontend loads runtime config from `GET /v1/runtime-config` (or `window.__ML_AIR_RUNTIME_CONFIG__` injected at container start).
3. Frontend calls `GET /v1/bootstrap/context`.
4. Backend returns `effective_scope` + accessible scope list, derived from control-plane mapping (not client cache).
5. Frontend sets active context from backend response and renders data surfaces.
6. All subsequent API calls include active `tenant_id` and `project_id` headers from this resolved context.

## API contract

### `GET /v1/runtime-config`

Purpose: publish mutable deploy-time UI config without rebuilding frontend image.

Response example:

```json
{
  "environment": "staging",
  "api_base_url": "https://mlair-api.staging.example.com",
  "realtime_base_url": "wss://mlair-realtime.staging.example.com/ws",
  "default_tenant_hint": "default",
  "default_project_hint": "default_project",
  "features": {
    "dataset_hub_v2": true,
    "strict_dataset_version_required": true,
    "strict_dataset_version_all_post_runs": false,
    "scope_debug_panel": true,
    "serving_slots_http": false
  },
  "build": {
    "frontend_version": "0.6.94",
    "frontend_commit": "abc1234"
  }
}
```

Rules:

- **`features.strict_dataset_version_*`** reflects dataset version pinning toggles (see [`docs/api/dataset-version-immutability.md`](../api/dataset-version-immutability.md)); UIs and integrators should not assume defaults without reading this object.
- runtime config is non-secret and cacheable for short TTL (30-60s).
- secrets remain server-side only.
- if endpoint is unavailable, frontend falls back to injected `window.__ML_AIR_RUNTIME_CONFIG__`.

### `GET /v1/bootstrap/context`

Purpose: resolve initial user context from backend mapping as source of truth.

Response example:

```json
{
  "user": {
    "subject": "user_42",
    "email": "ops@example.com",
    "roles": ["maintainer"]
  },
  "effective_scope": {
    "tenant_id": "default",
    "project_id": "default_project",
    "source": "control_plane_mapping",
    "mapping_version": 18
  },
  "defaults": {
    "tenant_id": "default",
    "project_id": "default_project"
  },
  "accessible_scopes": [
    {"tenant_id": "default", "project_id": "default_project", "role": "maintainer"},
    {"tenant_id": "default", "project_id": "fraud_project", "role": "viewer"}
  ],
  "feature_flags": {
    "scope_switcher": true
  }
}
```

Rules:

- frontend must treat `effective_scope` as canonical on startup.
- token claims can inform auth but do not drive UI scope selection directly.
- response includes `mapping_version` so frontend can invalidate stale local cache.
- `accessible_scopes` / default project resolution use the same project list as `GET /v1/tenants/{tenant}/projects`: **operational discovery plus** rows from the **`tenant_projects`** catalog (see [Configure Tenant and Project Scope](./configure-tenant-project-scope.md)). Tokens that enumerate explicit `project_ids` are unchanged.

### `POST /v1/auth/context/switch`

Purpose: validate and persist last-selected scope.

Request:

```json
{
  "tenant_id": "default",
  "project_id": "fraud_project",
  "expected_mapping_version": 18
}
```

Response:

```json
{
  "ok": true,
  "effective_scope": {
    "tenant_id": "default",
    "project_id": "fraud_project",
    "source": "user_override",
    "mapping_version": 18
  }
}
```

Error model:

- `403` with `reason_code=scope_not_allowed`
- `404` with `reason_code=scope_not_found`
- `409` with `reason_code=mapping_version_stale` (frontend should re-bootstrap)

### `DELETE /v1/auth/context/switch`

Purpose: clear user scope override and return to backend bootstrap default scope.

## Frontend behavior contract

### Required states

- `loading_bootstrap`
- `ready`
- `no_scope_access`
- `mapping_mismatch`
- `auth_expired`
- `runtime_config_missing`

The UI must never render a blank data screen without one of these explicit states.

### Startup sequence (client)

1. load runtime config
2. call bootstrap context
3. initialize global scope store from `effective_scope`
4. mount data queries only after scope init completes
5. on `mapping_version_stale` or repeated `403`, auto-refresh bootstrap once before showing error

### Cache policy

- keep local scope cache as optimization only (`localStorage` optional)
- invalidate local scope if `mapping_version` changes
- never trust cache over backend `effective_scope`
- optional server-side TTL for overrides: set `ML_AIR_SCOPE_OVERRIDE_TTL_SECONDS`

## Scope decision trace for operators

### Structured log fields (mandatory)

- `trace_id`
- `subject`
- `tenant_id`
- `project_id`
- `scope_source` (`token_claim`, `control_plane_mapping`, `user_override`)
- `mapping_version`
- `decision` (`allow`, `deny`)
- `reason_code`
- `token_issuer`

### Debug endpoint

`GET /v1/auth/scope-decision?tenant_id={id}&project_id={id}`

Response example:

```json
{
  "decision": "deny",
  "reason_code": "project_not_mapped_to_subject",
  "subject": "user_42",
  "tenant_id": "default",
  "project_id": "risk_project",
  "mapping_version": 18,
  "sources_checked": [
    "token_claims",
    "control_plane_mapping",
    "tenant_policy"
  ]
}
```

This endpoint is operator-facing and read-only. It must not expose secrets.

## Downstream integration contract

### Sync events

Emit normalized events whenever scope mapping changes:

- `scope.created`
- `scope.updated`
- `scope.revoked`

Event payload:

```json
{
  "event_id": "evt_01",
  "event_type": "scope.updated",
  "occurred_at": "2026-05-09T06:30:00Z",
  "subject": "user_42",
  "tenant_id": "default",
  "project_id": "fraud_project",
  "mapping_version": 19
}
```

Delivery requirements:

- idempotency via `event_id`
- retry with exponential backoff
- dead-letter queue on max retry

### Bootstrap expectation for external apps

Any downstream app integrating MLAir scope must:

1. call bootstrap context at session start
2. persist only short-lived local cache
3. refresh scope when receiving `scope.updated`/`scope.revoked`

## Rollout checklist (safe cutover)

### Phase 1: Contract introduction

- add `runtime-config` endpoint or startup-injected runtime config file
- add `bootstrap/context` endpoint in backend
- frontend consumes bootstrap at app init
- keep existing token-based fallback for one release behind feature flag

### Phase 2: Source-of-truth enforcement

- default to bootstrap scope in all pages
- require scope switch via `POST /auth/context/switch`
- add operator debug endpoint and dashboards for reason_code distribution

### Phase 3: Strict mode

- disable token-claim-first UI path
- remove old client-only scope bootstrap
- enforce migration check in CI across N-2, N-1 to N

## Validation checklist

- cold start resolves scope from backend in one path only
- switching scope updates all data queries without full reload
- no blank data screen when scope mismatch happens
- dashboards show top deny reason codes by tenant/project
- downstream app receives and applies sync events idempotently

