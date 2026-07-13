# POST /tenants/{tenant_id}/projects/registry

## Goal

Declare a **project id** for a tenant in MLAir’s **catalog** (`tenant_projects`) so it appears in project lists and bootstrap scope **before** any operational rows (runs, models, datasets, and so on) exist for that project.

## When to use

- Onboarding a new project or environment where the external app already knows `project_id` but MLAir has no scoped data yet.
- Aligning the scope switcher with control-plane mappings without waiting for the first run or sync.

## Steps

1. Use a **maintainer** (or higher) bearer token scoped to the same `tenant_id` as in the URL (same rules as other tenant APIs).
2. Send JSON with `project_id` (required) and optional `name` for display in list APIs.
3. Re-fetch `GET /v1/tenants/{tenant_id}/projects` or `GET /v1/bootstrap/context` to confirm the project is visible.

## Command

**Auth:** `$TOKEN` from [Login and Identity](../guides/login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"

curl -sS -X POST \
  "$API/v1/tenants/$TENANT/projects/registry" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"project_north","name":"North project"}'
```

## Result

HTTP **200** with a small object, for example:

```json
{
  "tenant_id": "default",
  "project_id": "project_north",
  "name": "North project"
}
```

Calling again with the same `project_id` updates `name` and `updated_at` (upsert).

Reserved ids `all` and `global` (case-insensitive) are rejected with **400**.

## Done

See [Configure Tenant and Project Scope](../guides/configure-tenant-project-scope.md) for how listing merges catalog and discovery, and for troubleshooting.
