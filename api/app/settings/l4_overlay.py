"""L4 overlay helpers for Settings loader (Package 002 Phase 2+).

Resolution Phase 4+: L4 DB → L2 profile → L1 default (policy env aliases off).
Rollback: ``ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1`` restores env → L4 → profile → L1.
"""

from __future__ import annotations

from typing import Any


def get_l4_overlay() -> dict[str, Any] | None:
    try:
        from app.domains.platform.system_settings_service import get_l4_settings

        return get_l4_settings()
    except Exception:
        return None


def l4_bool(l4: dict[str, Any] | None, section: str, key: str) -> bool | None:
    if not l4:
        return None
    block = l4.get(section)
    if not isinstance(block, dict) or key not in block:
        return None
    val = block[key]
    if isinstance(val, bool):
        return val
    text = str(val).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return None


def l4_feature_bool(l4: dict[str, Any] | None, feature_key: str) -> bool | None:
    return l4_bool(l4, "features", feature_key)


def l4_int(l4: dict[str, Any] | None, section: str, key: str) -> int | None:
    if not l4:
        return None
    block = l4.get(section)
    if not isinstance(block, dict) or key not in block:
        return None
    try:
        return int(block[key])
    except (TypeError, ValueError):
        return None


def l4_float(l4: dict[str, Any] | None, section: str, key: str) -> float | None:
    if not l4:
        return None
    block = l4.get(section)
    if not isinstance(block, dict) or key not in block:
        return None
    try:
        return float(block[key])
    except (TypeError, ValueError):
        return None


def l4_str(l4: dict[str, Any] | None, section: str, key: str) -> str | None:
    if not l4:
        return None
    block = l4.get(section)
    if not isinstance(block, dict) or key not in block:
        return None
    text = str(block[key]).strip()
    return text or None


def l4_stage_order(l4: dict[str, Any] | None) -> tuple[str, ...] | None:
    if not l4:
        return None
    governance = l4.get("governance")
    if not isinstance(governance, dict):
        return None
    order = governance.get("promotion_stage_order")
    if isinstance(order, str):
        parts = tuple(p.strip().lower() for p in order.split(",") if p.strip())
        return parts or None
    if isinstance(order, list):
        parts = tuple(str(p).strip().lower() for p in order if str(p).strip())
        return parts or None
    return None
