# Configure Tenant and Project Scope

## Goal

Configure scope behavior so MLAir correctly lists and filters `tenant/project` in multi-tenant deployments (including clinic-style projects from external apps such as `vet-ai`).

## Steps

1. Ensure project discovery in MLAir is DB-driven.
2. Ensure external app sync creates scoped resources per clinic/project.
3. Load scope in MLAir UI and verify tenant/project dropdown values.
4. Confirm `global` and `all` behaviors match expected filtering.

## Command

```bash
# 1) Verify tenant projects from MLAir API
curl -H "Authorization: Bearer admin-token" \
  "http://localhost:8080/v1/tenants/default/projects?limit=200"

# 2) Trigger sync from vet-ai to ensure clinic scopes exist
curl -X POST -H "Authorization: Bearer admin-secret" \
  "http://localhost:8000/mlair/models/sync"

# 3) Verify tenant projects again (should include clinic_* scopes)
curl -H "Authorization: Bearer admin-token" \
  "http://localhost:8080/v1/tenants/default/projects?limit=200"
```

## Result

- `GET /v1/tenants/{tenant}/projects` returns real projects discovered from DB, not static hard-coded values.
- MLAir UI tenant/project dropdown can show clinic/project scopes beyond `global` and `all`.
- Scope filtering works consistently:
  - `global` -> `default_project`
  - `all` -> aggregate across all tenant projects
  - specific project -> scoped view for that project only

## Notes

- In `vet-ai`, default clinic scope behavior should be dynamic per clinic:
  - `project_id = clinic_<clinic_id_slug>`
- Use explicit map override only for legacy migration:
  - `MLAIR_USE_CLINIC_PROJECT_MAP=true`
  - `MLAIR_CLINIC_PROJECT_MAP_JSON={...}`
- Recommended defaults for new deployments:
  - `MLAIR_MODEL_SCOPE_PER_CLINIC=true`
  - `MLAIR_USE_CLINIC_PROJECT_MAP=false`
  - `MLAIR_ENSURE_CLINIC_SCOPES=true`

## Troubleshooting

- **Only `global/all` visible in dropdown**
  - Verify project discovery API output first.
  - Ensure sync has run and created tenant/project-scoped data.
  - Check token scope (`tenant_id`, `project_ids`) in `whoami`.
- **Clinic data merged into a non-clinic project (for example `risk_project`)**
  - Disable legacy map override (`MLAIR_USE_CLINIC_PROJECT_MAP=false`).
  - Re-sync scopes from external app.

## Done

Continue with [Manage Datasets and Train from Model](./manage-datasets-and-train-from-model.md) to validate end-to-end model training under the selected scope.
