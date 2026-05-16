# Promote a Model

## Goal

Promote a registered model version to the target stage.

## Steps

1. Pick model and version.
2. **Check eligibility** (optional): `GET .../versions/{version}/promotion-eligibility?target_stage=production` — returns `eligible`, `reasons[]` with `canonical_code` `GOVERNANCE_BLOCKED` when approval is missing.
3. **Approve** the version for production (unless `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1` is set on the API). Gated stages default to `production` only; override with `ML_AIR_PROMOTION_APPROVAL_STAGES=production,staging`.
4. Transition stage with **promote**.
5. Verify stage history.

## Command (approve then promote)

```bash
# Required when ML_AIR_SKIP_APPROVAL_FOR_PROMOTE is unset/0
curl -X PUT "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/versions/3/approval" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"approval_status": "approved", "reason": "validated offline"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/promote" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"version": 3, "stage": "production"}'
```

Use the numeric **`version`** from the model registry (see `GET .../models/{model_id}/versions`), not the path style from older examples.

## Result

Model version stage updates to `production`.
Promotion links the model to a validated pipeline run, task outputs, plugin behavior, and lineage history.

## Optional: notify downstream after promote

If a **downstream** serving or executor process should react when a version reaches `production` (or another promoted stage), set:

- `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` — POST target (**full URL**).
- `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` — shared secret (`Authorization: Bearer …` on the outbound request).

**Contract (mandatory reading for integrators):** [Downstream model promote webhook](./downstream-model-promote-webhook.md) — exact JSON schema, when MLAir **skips** the call (missing URL/token/`artifact_uri`), `idempotency_key` omission rules, and **best-effort** semantics (promote succeeds even if webhook fails).

Context in the model-centric guide: [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md#optional-http-notify-after-promote).

## Done

Deploy downstream app with promoted model reference.
