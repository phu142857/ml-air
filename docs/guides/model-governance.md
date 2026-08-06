# Model governance

Promote, approve, roll back, and operate model versions from Hub and API.

## Hub layout

Model detail focuses on governance (versions, approvals, trigger policy, serving metadata). Training and readiness live on **Dataset Hub**:

- **Readiness:** `/datasets/{dataset_id}` → Readiness tab (evaluate, history)
- **Run / Train:** Dataset Hub → Train with model (`POST .../runs/trigger`) or Run with pipeline
- Pipeline list/detail is observability-only (no trigger UI); automation uses API

## Promote a version

### Steps

1. Pick model and version.
2. **Check eligibility** (optional): `GET .../versions/{version}/promotion-eligibility?target_stage=production`
3. **Approve** for production (unless `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1`). Gated stages default to `production`; override with `ML_AIR_PROMOTION_APPROVAL_STAGES`.
4. **Promote** to target stage.
5. Verify stage history.

### Command

**Auth:** maintainer+ — `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X PUT "$API/v1/tenants/$TENANT/projects/$PROJECT/models/<model_id>/versions/3/approval" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approval_status": "approved", "reason": "validated offline"}'

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/models/<model_id>/promote" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": 3, "stage": "production"}'
```

Use numeric **`version`** from `GET .../models/{model_id}/versions`.

## Stage order and rollback

Configure linear stages (default **`staging` → `production`**):

```bash
ML_AIR_PROMOTION_STAGE_ORDER=staging,production
```

`GET /v1/runtime-config` → `features.promotion_stage_order` mirrors Hub behavior.

| Rule | Default |
|------|---------|
| Forward skip | Off — one stage per promote (`ML_AIR_PROMOTION_ALLOW_SKIP_STAGES=0`) |
| Approval for production | Required unless `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1` |
| Rollback | Enabled (`ML_AIR_ROLLBACK_ENABLED=1`) |
| Rollback approval | Not required unless `ML_AIR_ROLLBACK_REQUIRES_APPROVAL=1` |

API blocks return **422** (`approval_required_for_production`, `invalid_stage_transition`, `rollback_disabled`, …).

Successful promote to **`production`** auto-assigns the **`champion`** serving slot (metadata only).

## Serving slots

When `ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`:

- `GET|PUT .../models/{id}/serving` — champion / canary / candidate / challenger
- `GET .../models/{id}/serving/route` — metadata map for external load balancers (no traffic split in MLAir)

## Training plugins and promote blocks

Executors that promote after train/eval should treat promote **422** / approval blocks as **`promote_blocked`** metadata and keep the gate/task **SUCCESS** — do not fail the whole run solely for pending approval.

## Notify downstream after promote

| Path | When to use |
|------|-------------|
| [Semantic webhooks](./semantic-webhook-cookbook.md) on `model.promoted` | Hub realtime + existing subscription model |
| [Domain webhooks](../architecture/domain-events.md#domain-webhook-delivery) | Lifecycle accountability actions (`ML_AIR_DOMAIN_WEBHOOK_DELIVERY=1`) |
| [Downstream promote contract](./downstream-model-promote-webhook.md) | Legacy `MLAIR_MODEL_PROMOTE_*` reserved contract |

## Admission preflight

`POST .../admission/explain` aggregates quota, readiness, eligibility, and optional promotion checks without creating a run.

## Related

- [Register a model](./register-model.md)
- [Model-centric pipeline mapping](./model-centric-pipeline-mapping-and-trigger.md)
- [Domain Audit / timeline](../architecture/audit-flow.md)
- [Compare runs](./compare-resources.md#compare-runs) before promoting candidates
