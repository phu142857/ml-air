"""Stage order, forward promotion, and rollback policy (Wave 2 governance)."""

from __future__ import annotations

import os

_DEFAULT_STAGE_ORDER = ("staging", "production")


def promotion_stage_order() -> tuple[str, ...]:
    raw = str(os.getenv("ML_AIR_PROMOTION_STAGE_ORDER", "staging,production")).strip()
    parts = tuple(p.strip().lower() for p in raw.split(",") if p.strip())
    return parts if parts else _DEFAULT_STAGE_ORDER


def rollback_enabled() -> bool:
    return str(os.getenv("ML_AIR_ROLLBACK_ENABLED", "1")).strip().lower() not in ("0", "false", "no", "off")


def rollback_requires_approval() -> bool:
    return str(os.getenv("ML_AIR_ROLLBACK_REQUIRES_APPROVAL", "1")).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def allow_skip_forward_stages() -> bool:
    return str(os.getenv("ML_AIR_PROMOTION_ALLOW_SKIP_STAGES", "1")).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _normalize_stage(stage: str | None) -> str | None:
    s = (stage or "").strip().lower()
    if not s or s == "archived":
        return None
    return s


def stage_rank(stage: str | None, order: tuple[str, ...] | None = None) -> int | None:
    order = order or promotion_stage_order()
    s = _normalize_stage(stage)
    if s is None:
        return None
    try:
        return order.index(s)
    except ValueError:
        return None


def transition_kind(current_stage: str | None, target_stage: str) -> str:
    """``forward`` | ``rollback`` | ``noop`` | ``unknown``."""
    order = promotion_stage_order()
    target = (target_stage or "").strip().lower() or "production"
    current = _normalize_stage(current_stage)
    if current == target:
        return "noop"
    cr = stage_rank(current, order)
    tr = stage_rank(target, order)
    if tr is None:
        return "unknown"
    if cr is None:
        return "forward"
    if tr > cr:
        return "forward"
    if tr < cr:
        return "rollback"
    return "unknown"


def evaluate_stage_transition(
    *,
    current_stage: str | None,
    target_stage: str,
) -> tuple[bool, str | None, str | None, str]:
    """
    Returns (allowed, error_code, message, transition_kind).
    transition_kind is one of forward / rollback / noop / unknown.
    """
    order = promotion_stage_order()
    target = (target_stage or "production").strip().lower() or "production"
    kind = transition_kind(current_stage, target)

    if kind == "noop":
        return False, "already_at_stage", f"Version is already at stage '{target}'.", kind

    if kind == "unknown":
        allowed = {s for s in order}
        return (
            False,
            "unknown_target_stage",
            f"Target stage '{target}' is not in promotion order ({', '.join(order)}).",
            kind,
        )

    cr = stage_rank(current_stage, order)
    tr = stage_rank(target, order)

    if kind == "rollback":
        if not rollback_enabled():
            return (
                False,
                "rollback_disabled",
                "Rollback is disabled (ML_AIR_ROLLBACK_ENABLED=0).",
                kind,
            )
        if cr is not None and tr is not None and tr >= cr:
            return False, "invalid_rollback", "Rollback target must be a lower stage.", kind
        return True, None, None, kind

    # forward
    if cr is None:
        # Unlisted current stage: allow first hop to target if target is in order
        if tr == 0 or allow_skip_forward_stages():
            return True, None, None, kind
        return (
            False,
            "invalid_stage_transition",
            f"Version must be promoted to '{order[0]}' before '{target}'.",
            kind,
        )

    if tr == cr + 1:
        return True, None, None, kind

    if allow_skip_forward_stages() and tr > cr:
        return True, None, None, kind

    if tr <= cr:
        return (
            False,
            "invalid_stage_transition",
            "Use Rollback to move to a lower stage, not Promote.",
            kind,
        )

    next_stage = order[cr + 1] if cr + 1 < len(order) else None
    if next_stage:
        return (
            False,
            "invalid_stage_transition",
            f"Forward promotion must go to the next stage '{next_stage}' (or enable ML_AIR_PROMOTION_ALLOW_SKIP_STAGES).",
            kind,
        )
    return False, "invalid_stage_transition", "No higher stage available in promotion order.", kind


def promotion_policy_runtime() -> dict:
    return {
        "promotion_stage_order": list(promotion_stage_order()),
        "promotion_allow_skip_stages": allow_skip_forward_stages(),
        "rollback_enabled": rollback_enabled(),
        "rollback_requires_approval": rollback_requires_approval(),
    }
