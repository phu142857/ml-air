# POST /models

## Goal

Create a model entry in MLAir registry for a project.

## Steps

1. Prepare model name and optional description.
2. Call create model endpoint in tenant/project scope.
3. Save returned `model_id` for version creation.

## Command

**Auth:** `$TOKEN` from [Login and Identity](../guides/login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/models" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "example-model",
    "description": "Registry entry synced from external app"
  }'
```

## Result

HTTP 200 with created model object including `model_id`.

## Done

Use `model_id` in [POST /models/{id}/versions](./post-model-versions.md).
