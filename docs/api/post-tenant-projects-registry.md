# POST /tenants/{tenant_id}/projects/registry

## Goal

Declare a **project id** for a tenant in MLAir’s **catalog** (`tenant_projects`) so it appears in project lists and bootstrap scope **before** any operational rows (runs, models, datasets, and so on) exist for that project.

## When to use

- Onboarding a new clinic or environment where the external app already knows `project_id` but MLAir has no scoped data yet.
- Aligning the scope switcher with control-plane mappings without waiting for the first run or sync.

## Steps

1. Use a **maintainer** (or higher) bearer token scoped to the same `tenant_id` as in the URL (same rules as other tenant APIs).
2. Send JSON with `project_id` (required) and optional `name` for display in list APIs.
3. Re-fetch `GET /v1/tenants/{tenant_id}/projects` or `GET /v1/bootstrap/context` to confirm the project is visible.

## Command

```bash
curl -sS -X POST \
  "http://localhost:8080/v1/tenants/default/projects/registry" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"clinic_north","name":"North clinic"}'
```

## Result

HTTP **200** with a small object, for example:

```json
{
  "tenant_id": "default",
  "project_id": "clinic_north",
  "name": "North clinic"
}
```

Calling again with the same `project_id` updates `name` and `updated_at` (upsert).

Reserved ids `all` and `global` (case-insensitive) are rejected with **400**.

## Done

See [Configure Tenant and Project Scope](../guides/configure-tenant-project-scope.md) for how listing merges catalog and discovery, and for troubleshooting.
