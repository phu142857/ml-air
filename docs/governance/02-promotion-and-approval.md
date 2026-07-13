# Promotion and Approval

**Document ID:** `docs/governance/02-promotion-and-approval.md`  
**Series:** 004 Governance Architecture  
**Status:** Frozen v1.0

---

## Purpose

Define how model versions move between lifecycle stages, when manual approval is required, and how rollback differs from forward promotion.

**Code:** `api/app/domains/governance/promotion_policy.py`, `model_registry_service.py`

---

## Stage model

Promotion order is an ordered list of stage names (default: `staging` → `production`). Stages not in the list cannot be targeted.

| Transition | Rule |
|------------|------|
| **Forward** | Target rank &gt; current rank; default one hop unless skip-stages allowed |
| **Rollback** | Target rank &lt; current; gated by `rollback_enabled` |
| **Noop** | Target equals current → rejected (`already_at_stage`) |
| **Unknown** | Target not in order → rejected (`unknown_target_stage`) |

`transition_kind(current, target)` returns `forward` \| `rollback` \| `noop` \| `unknown`.

---

## Configuration (L4)

Stored in `system_settings.settings.governance` and resolved via `Settings.promotion`:

| L4 key | Settings field | Meaning |
|--------|----------------|---------|
| `promotion_stage_order` | `stage_order` | Ordered list of stage names |
| `skip_approval_for_promote` | `skip_approval_for_promote` | When `true`, approval gate is off |
| `promotion_allow_skip_stages` | `allow_skip_forward_stages` | Allow non-sequential forward jumps |
| `rollback_enabled` | `rollback_enabled` | Allow rollback transitions |
| `rollback_requires_approval` | `rollback_requires_approval` | Rollback needs `approval_status=approved` |
| `promotion_approval_stages` | `approval_stages` | Stages that require approval (default: `production`) |

Hub **System (L4)** tab and `PATCH /v1/system/settings` edit these keys. Profile bundle seeds L4 on first boot.

---

## Approval gate

When `skip_approval_for_promote` is **false** (enforced governance):

1. Promote to a stage in `approval_stages` requires `approval_status = approved` on the model version.
2. `pending_manual_approval` → `approval_pending`; `rejected` → `approval_rejected`.
3. Rollback to a lower stage may require approval when `rollback_requires_approval` is true.

`GET .../promotion-eligibility` and `POST .../promote` use the same `compute_promotion_eligibility()` logic.

**Runtime snapshot:** `GET /v1/runtime-config` → `promotion_governance_enabled`, `promotion_approval_stages`, `promotion_stage_order`, etc.

---

## Profile guidance

| Profile | Typical L4 / profile intent |
|---------|------------------------------|
| `development` | `skip_approval_for_promote: true` — fast local iteration |
| `staging` | Approval on for production stage before prod sign-off |
| `production` | `skip_approval_for_promote: false`; `rollback_requires_approval: true` |

Lab images may still seed permissive defaults; operators tighten via L4 PATCH before staging/prod sign-off.

---

## APIs

| Method | Path | Role |
|--------|------|------|
| `GET` | `/v1/tenants/{t}/projects/{p}/models/{m}/versions/{v}/promotion-eligibility` | Preview gates |
| `POST` | `/v1/tenants/{t}/projects/{p}/models/{m}/versions/{v}/promote` | Apply transition |
| `POST` | `/v1/.../approval` | Set approval status (maintainer+) |

---

## Error codes (promotion)

| Code | Meaning |
|------|---------|
| `invalid_stage_transition` | Forward skip disallowed or wrong direction |
| `rollback_disabled` | Rollback feature off |
| `approval_required` / `approval_pending` / `approval_rejected` | Approval gate |
| `already_at_stage` | No-op promote |

Canonical hub code: `GOVERNANCE_BLOCKED` on eligibility reasons.

---

## Non-goals (v1.0)

- Per-tenant promotion order overrides (L5 — future)
- Multi-approver workflows / SOX ticketing integration
