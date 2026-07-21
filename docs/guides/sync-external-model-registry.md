# Sync External Model Registry

## Goal

Sync models from an external MLOps app into MLAir model registry with tenant/project scope.

## Steps

1. Enable MLAir integration in your external app.
2. Configure tenant/project defaults and scope mapping.
3. Run startup sync or manual sync endpoint.
4. Verify model + version records in MLAir API.

## Command

```bash
# Example env in external app
export MLAIR_ENABLED=true
export MLAIR_API_BASE_URL=http://localhost:8080
export MLAIR_TENANT_ID=default
export MLAIR_PROJECT_ID=default_project
# Your external app's own scope-mapping flags (names vary by product)
export YOUR_APP_MODEL_SCOPE_PER_PROJECT=true
export YOUR_APP_PROJECT_MAP_JSON='{"source-a":"project_a","source-b":"project_b"}'
export YOUR_APP_TENANT_MAP_JSON='{"source-a":"default","source-b":"default"}'

# Manual sync endpoint (example from an external bridge service)
curl -X POST http://localhost:8000/your-app/models/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify models in one scope (MLAir API)
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TOKEN="<access_token from POST /v1/auth/login>"

curl "$API/v1/tenants/default/projects/project_a/models?limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

## Result

Models are created (or reused) per configured scope, and new artifact URIs are added as model versions without duplicating existing URIs.

## Done

Your external model store is discoverable in MLAir registry and can be used by downstream pipeline runs.
