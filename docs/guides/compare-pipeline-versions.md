# Compare Pipeline Versions

## Goal

Compare two pipeline versions to understand task-level changes.

## Steps

1. Select base and target version.
2. Inspect task diff.
3. Validate changed config and plugins.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/pipelines/<pipeline_id>/versions/diff?base=<v1>&target=<v2>"
```

## Result

Diff response shows added, removed, and changed task definitions.

## Done

Proceed to deployment after reviewing retry and resource settings.
