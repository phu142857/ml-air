# Register a Model

## Goal

Register a model artifact from a successful run.

## Steps

1. Select a successful run and task artifact.
2. Call model registry API.
3. Verify version is created.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/models/register" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<run_id>","task_id":"<task_id>","artifact_uri":"s3://bucket/model.pkl","name":"demo-model"}'
```

## Result

A new model version is registered and ready for stage transition.

## Done

Continue with [Promote a Model](./promote-model.md).
