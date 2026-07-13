# POST /models/{id}/versions

## Goal

Register one model artifact URI as a new model version.

## Steps

1. Get `model_id` from create/list models API.
2. Provide immutable `artifact_uri`.
3. Set lifecycle stage (`staging`, `production`, `archived`).

## Command

**Auth:** `$TOKEN` from [Login and Identity](../guides/login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/models/<model_id>/versions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "artifact_uri": "s3://mlair-artifacts/example-project/model_20260426_101010",
    "stage": "staging"
  }'
```

## Result

HTTP 200 with created model version metadata and server version identifier.

OpenAPI: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) — `CreateModelVersionRequest`, `ModelVersionRow`.

## Done

Version is now available for promotion and deployment workflows.
