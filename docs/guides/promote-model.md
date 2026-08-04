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

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

# Required when ML_AIR_SKIP_APPROVAL_FOR_PROMOTE is unset/0
curl -X PUT "$API/v1/tenants/$TENANT/projects/$PROJECT/models/<model_id>/versions/3/approval" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approval_status": "approved", "reason": "validated offline"}'

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/models/<model_id>/promote" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": 3, "stage": "production"}'
```

Use the numeric **`version`** from the model registry (see `GET .../models/{model_id}/versions`), not the path style from older examples.

## Result

Model version stage updates to `production`.
Promotion links the model to a validated pipeline run, task outputs, plugin behavior, and lineage history.

## Optional: notify downstream after promote

**Phase 1:** the dedicated `MLAIR_MODEL_PROMOTE_*` HTTP helper is **not wired**. Prefer
[semantic webhook subscriptions](./semantic-webhook-cookbook.md) on `model.promoted`
(or Hub realtime) for outbound notify today.

Historical / Phase 2 contract notes: [Downstream model promote webhook](./downstream-model-promote-webhook.md).

## Done

Deploy downstream app with promoted model reference.
