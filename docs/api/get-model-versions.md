# GET /models/{id}/versions

## Goal

List all versions for one model in a project scope.

## Steps

1. Determine target tenant/project/model.
2. Call list versions endpoint.
3. Filter by stage in your client if needed.

## Command

**Auth:** `$TOKEN` from [Login and Identity](../guides/login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/models/<model_id>/versions" \
  -H "Authorization: Bearer $TOKEN"
```

## Result

HTTP 200 with `items` array of model versions, including artifact URI and stage.

## Done

You can pick a version for promotion or compare artifact lineage across runs.
