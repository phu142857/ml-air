# Register a Model

## Goal

Register a model artifact from a successful run.

## Steps

1. Select a successful run and task artifact.
2. Call model registry API.
3. Verify version is created.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models/register" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<run_id>","task_id":"<task_id>","artifact_uri":"s3://bucket/model.pkl","name":"demo-model"}'
```

## Result

A new model version is registered and ready for stage transition.

## Done

Continue with [Promote a Model](./promote-model.md).
