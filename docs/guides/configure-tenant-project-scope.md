# Configure Tenant and Project Scope

## Goal

Configure scope behavior so MLAir correctly lists and filters `tenant/project` in multi-tenant deployments (including projects created by external apps).

## How listing works

Project and tenant lists are built from **two sources** (merged and de-duplicated):

1. **Operational discovery** — distinct `tenant_id` / `project_id` values already present in scoped tables (runs, models, datasets, experiments, pipeline versions, lineage, policies, and similar).
2. **Project catalog** — table `tenant_projects` (Alembic revision `0020_tenant_project_registry`). Rows here make a project appear in `GET /v1/tenants/{tenant}/projects` and in `GET /v1/bootstrap/context` **even when nothing has been written yet** under that project in the operational tables. Tenants that exist only in `tenant_projects` also appear in `GET /v1/tenants`.

Display names: if a project is in `tenant_projects`, the API uses the stored `name`; otherwise the list falls back to `name` = `project_id` as before.

## Steps

1. Run database migrations so `tenant_projects` exists (`alembic upgrade head` in your deploy process).
2. Keep operational discovery as today: sync or user activity still creates the usual scoped rows.
3. For projects that must be selectable **before** first run/model/dataset (for example a new project), register them in the catalog (see **Command** below) or insert equivalent rows into `tenant_projects`.
4. Ensure external app sync still creates scoped resources per project when activity exists (discovery continues to pick those up).
5. Load scope in MLAir UI and verify tenant/project dropdown values.
6. Confirm `all` behavior matches expected filtering for both tenant and project.

## Command

```bash
# 1) Verify tenants from MLAir API (DB-driven)
curl -H "Authorization: Bearer admin-token" \
  "http://localhost:8080/v1/tenants?limit=200"

# 2) Verify tenant projects from MLAir API
curl -H "Authorization: Bearer admin-token" \
  "http://localhost:8080/v1/tenants/default/projects?limit=200"

# 2b) Optional — register a project in the catalog (maintainer+), no runs required
curl -sS -X POST \
  "http://localhost:8080/v1/tenants/default/projects/registry" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"acme_project","name":"ACME"}'

# 3) Trigger sync from your external app to ensure its scopes exist
curl -X POST -H "Authorization: Bearer admin-secret" \
  "http://localhost:8000/your-app/models/sync"

# 4) Verify tenant projects again (should include the new scopes)
curl -H "Authorization: Bearer admin-token" \
  "http://localhost:8080/v1/tenants/default/projects?limit=200"
```

## Result

- `GET /v1/tenants` returns tenants from operational data **plus** any tenant that appears only in `tenant_projects` (subject to token scope for single-tenant tokens).
- `GET /v1/tenants/{tenant}/projects` returns the **union** of catalog projects and projects discovered from operational tables, not static hard-coded values.
- `POST /v1/tenants/{tenant}/projects/registry` upserts a catalog row (`maintainer` or higher; same tenant authorization rules as other tenant APIs). Narrative: [POST /tenant projects registry](../api/post-tenant-projects-registry.md).
- MLAir UI tenant/project dropdown can show dynamic tenant/project scopes from database data.
- Scope filtering works consistently:
  - `tenant=all` -> aggregate across all visible tenants
  - `project=all` -> aggregate across all visible projects in the selected tenant
  - specific project -> scoped view for that project only

## Notes

- MLAir does not impose a project-mapping scheme. The external app decides how it maps its own entities to `tenant_id` / `project_id`; MLAir only stores and returns those scopes (mapping flag names vary by product).
- Prefer dynamic per-source scopes over static maps; reserve explicit map overrides for legacy migration.
- For projects that must exist before any operational rows, register them in the catalog (`POST .../projects/registry`).

## Troubleshooting

- **Project missing from list before any runs or models exist**
  - Expected if the project was never registered: discovery alone does not invent project IDs. Call `POST .../projects/registry` (or insert into `tenant_projects`) so the UI and `GET /v1/bootstrap/context` can offer that scope.
  - Confirm migration `0020_tenant_project_registry` has been applied if the POST returns a server error about a missing relation.
- **Only `all` visible in dropdown**
  - Verify tenant discovery API output first (`GET /v1/tenants`).
  - Verify project discovery API output next (`GET /v1/tenants/{tenant}/projects`).
  - Ensure sync has run and created tenant/project-scoped data, **or** register catalog rows for empty projects.
  - Check token scope (`tenant_id`, `project_ids`) in `whoami`.
- **Data merged into the wrong project (for example `risk_project`)**
  - Check the external app's own scope-mapping configuration.
  - Re-sync scopes from the external app.

## Done

Continue with [Manage Datasets and Train from Model](./manage-datasets-and-train-from-model.md) to validate end-to-end model training under the selected scope.
