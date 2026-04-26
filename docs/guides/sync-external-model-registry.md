# Sync External Model Registry

## Goal

Sync models from an external MLOps app (for example Vet-AI) into MLAir model registry with clinic/project scope.

## Steps

1. Enable MLAir integration in your external app.
2. Configure tenant/project defaults and clinic mapping.
3. Run startup sync or manual sync endpoint.
4. Verify model + version records in MLAir API.

## Command

```bash
# Example env in external app
export MLAIR_ENABLED=true
export MLAIR_API_BASE_URL=http://localhost:8080
export MLAIR_TENANT_ID=default
export MLAIR_PROJECT_ID=default_project
export MLAIR_MODEL_SCOPE_PER_CLINIC=true
export MLAIR_CLINIC_PROJECT_MAP_JSON='{"clinic-a":"project_clinic_a","clinic-b":"project_clinic_b"}'
export MLAIR_CLINIC_TENANT_MAP_JSON='{"clinic-a":"default","clinic-b":"default"}'

# Manual sync endpoint (example from Vet-AI bridge)
curl -X POST http://localhost:8000/mlair/models/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify models in one scope
curl "http://localhost:8080/v1/tenants/default/projects/project_clinic_a/models?limit=50" \
  -H "Authorization: Bearer maintainer-token"
```

## Result

Models are created (or reused) per configured scope, and new artifact URIs are added as model versions without duplicating existing URIs.

## Done

Your external model store is discoverable in MLAir registry and can be used by downstream pipeline runs.
