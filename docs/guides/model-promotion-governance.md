# Model promotion and rollback governance (Wave 2)

## Stage order

Configure linear promotion stages (default **`staging` → `production`**):

```bash
ML_AIR_PROMOTION_STAGE_ORDER=staging,production
# Three-stage example:
ML_AIR_PROMOTION_STAGE_ORDER=dev,staging,production
```

`GET /v1/runtime-config` → `features.promotion_stage_order` mirrors this for the Hub.

## Forward promotion

- By default, versions may only move **one stage forward** per promote (`ML_AIR_PROMOTION_ALLOW_SKIP_STAGES=0`).
- Stages in `ML_AIR_PROMOTION_APPROVAL_STAGES` (default `production`) require `approval_status=approved` unless `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1`.

## Rollback

- **Rollback** = move to a **lower** stage in `ML_AIR_PROMOTION_STAGE_ORDER`.
- Enabled by default (`ML_AIR_ROLLBACK_ENABLED=1`). Set `0` to disable Hub rollback buttons.
- Rollback does **not** require approval unless `ML_AIR_ROLLBACK_REQUIRES_APPROVAL=1`.

## API

- `GET .../versions/{v}/promotion-eligibility?target_stage=` returns `transition` (`forward` | `rollback` | `noop`) and `reasons`.
- `POST .../models/{id}/promote` enforces the same rules; governance blocks return **422** (including `approval_required_for_production`, `approval_required`, `approval_pending`, `approval_rejected`, `already_at_stage`, `invalid_stage_transition`, `rollback_disabled`, …) — not 404.
- Successful promote to **`production`** auto-assigns the version to the **`champion`** serving slot (metadata only; no traffic split). See serving slots below.

## Soft-block in training plugins

Executors that call promote after train/eval (for example YOLO lifecycle) should treat promote **422** / approval blocks as **`promote_blocked`** metadata and keep the gate/task **SUCCESS**, so the run is not failed solely because production approval is pending.

## Serving slots (metadata)

When `ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`:

- `GET|PUT .../models/{id}/serving` and `GET .../models/{id}/serving/route` expose champion / canary / candidate / challenger assignments.
- `serving/route` is a **metadata map** for external LBs — MLAir does not enforce traffic split.

## Admission explain (preflight)

`POST .../admission/explain` aggregates quota snapshot, pipeline inputs readiness, training-policy eligibility, and optional promotion eligibility into one dry-run payload (`admitted` / `checks[]`). It does not create a run.

## Hub

Model detail **Versions** tab: **Promote → {next}** and **Rollback → {previous}** derive targets from runtime-config stage order.
