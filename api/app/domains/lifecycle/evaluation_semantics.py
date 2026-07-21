"""Pure helpers for comparing dataset readiness evaluation payloads (no I/O)."""

from __future__ import annotations

import json
from typing import Any


def readiness_reasons_semantic_signature(reasons: Any) -> str:
    """Stable string for comparing persisted vs fresh evaluation reasons (order-insensitive)."""
    pairs: list[tuple[str, str]] = []
    if isinstance(reasons, list):
        for r in reasons:
            if isinstance(r, dict):
                code = str(r.get("code") or "").strip().lower()
                msg = str(r.get("message") or "").strip()
                pairs.append((code, msg))
            elif isinstance(r, str) and r.strip():
                pairs.append((r.strip().lower(), ""))
    pairs.sort()
    return json.dumps(pairs, separators=(",", ":"))


def normalize_dataset_version_id(value: Any) -> str | None:
    """Coalesce JSON/API null, empty string, and missing keys to None for version scope matching."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _int_field(d: dict[str, Any], key: str) -> int:
    v = d.get(key)
    if v is None:
        return 0
    return int(v)


def readiness_eval_result_matches_stored_row(stored: dict[str, Any], result: dict[str, Any]) -> bool:
    """True when a new evaluation would not change semantic audit content for this policy+version scope."""
    if _int_field(stored, "required_size") != _int_field(result, "required_size"):
        return False
    if _int_field(stored, "current_size") != _int_field(result, "current_size"):
        return False
    if str(stored.get("status") or "").strip().lower() != str(result.get("status") or "").strip().lower():
        return False
    if str(stored.get("policy_id") or "") != str(result.get("policy_id") or ""):
        return False
    if normalize_dataset_version_id(stored.get("dataset_version_id")) != normalize_dataset_version_id(
        result.get("dataset_version_id")
    ):
        return False
    return readiness_reasons_semantic_signature(stored.get("reasons")) == readiness_reasons_semantic_signature(
        result.get("reasons")
    )
