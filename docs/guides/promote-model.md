# Promote a Model

## Goal

Promote a registered model version to the target stage.

## Steps

1. Pick model and version.
2. Transition stage.
3. Verify stage history.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_name>/versions/<version>/promote" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"stage":"production"}'
```

## Result

Model version stage updates to `production`.
Promotion links the model to a validated pipeline run, task outputs, plugin behavior, and lineage history.

## Done

Deploy downstream app with promoted model reference.
