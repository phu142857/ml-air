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
- `POST .../models/{id}/promote` enforces the same rules; **422** for `invalid_stage_transition`, `rollback_disabled`, etc.

## Hub

Model detail **Versions** tab: **Promote → {next}** and **Rollback → {previous}** derive targets from runtime-config stage order.
