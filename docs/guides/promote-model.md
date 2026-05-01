# Promote a Model

## Goal

Promote a registered model version to the target stage.

## Steps

1. Pick model and version.
2. Transition stage.
3. Verify stage history.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/promote" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"version": 3, "stage": "production"}'
```

Use the numeric **`version`** from the model registry (see `GET .../models/{model_id}/versions`), not the path style from older examples.

## Result

Model version stage updates to `production`.
Promotion links the model to a validated pipeline run, task outputs, plugin behavior, and lineage history.

## Optional: notify an external executor after promote

If the serving or training runtime lives outside MLAir, set:

- `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` — POST target (full URL).
- `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` — shared secret (`Authorization: Bearer …`).

MLAir sends JSON with `tenant_id`, `project_id`, `model_id`, `version`, `artifact_uri`, and an idempotency key. If the URL or token is unset, no request is made. Failures are logged only; the promote in MLAir still succeeds.

See [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md#promote--optional-http-notify-executor--serving).

## Done

Deploy downstream app with promoted model reference.
