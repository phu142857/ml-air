# POST /models

## Goal

Create a model entry in MLAir registry for a project.

## Steps

1. Prepare model name and optional description.
2. Call create model endpoint in tenant/project scope.
3. Save returned `model_id` for version creation.

## Command

```bash
curl -X POST \
  "http://localhost:8080/v1/tenants/default/projects/default_project/models" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vet-ai-model-clinic-a",
    "description": "Registry entry synced from external app"
  }'
```

## Result

HTTP 200 with created model object including `model_id`.

## Done

Use `model_id` in [POST /models/{id}/versions](./post-model-versions.md).
