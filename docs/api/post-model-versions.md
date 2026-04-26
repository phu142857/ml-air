# POST /models/{id}/versions

## Goal

Register one model artifact URI as a new model version.

## Steps

1. Get `model_id` from create/list models API.
2. Provide immutable `artifact_uri`.
3. Set lifecycle stage (`staging`, `production`, `archived`).

## Command

```bash
curl -X POST \
  "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/versions" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{
    "artifact_uri": "s3://mlair-artifacts/vet-ai/clinic-a/model_20260426_101010",
    "stage": "staging"
  }'
```

## Result

HTTP 200 with created model version metadata and server version identifier.

## Done

Version is now available for promotion and deployment workflows.
