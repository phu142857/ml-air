"""Stable canonical readiness / eligibility reason codes (ROADMAP Phase 2).

Internal API ``code`` values (``size_threshold``, ``freshness``, …) remain stable for clients.
Each reason also carries ``canonical_code`` for cross-surface analytics and metrics.
"""

from __future__ import annotations

# Canonical uppercase identifiers (contract surface).
THRESHOLD_NOT_MET = "THRESHOLD_NOT_MET"
FRESHNESS_NOT_MET = "FRESHNESS_NOT_MET"
MODEL_POLICY_MISMATCH = "MODEL_POLICY_MISMATCH"
GOVERNANCE_BLOCKED = "GOVERNANCE_BLOCKED"
LEGACY_COMPATIBILITY_FALLBACK = "LEGACY_COMPATIBILITY_FALLBACK"
UNKNOWN_READINESS_REASON = "UNKNOWN_READINESS_REASON"
DATA_DRIFT_EXCEEDED = "DATA_DRIFT_EXCEEDED"

_READINESS_CODE_TO_CANONICAL: dict[str, str] = {
    "size_threshold": THRESHOLD_NOT_MET,
    "freshness": FRESHNESS_NOT_MET,
    "model_compatibility": MODEL_POLICY_MISMATCH,
    "approval": GOVERNANCE_BLOCKED,
    "validation_rules": GOVERNANCE_BLOCKED,
    "data_drift": DATA_DRIFT_EXCEEDED,
    "legacy_fallback": LEGACY_COMPATIBILITY_FALLBACK,
}

# Prometheus label values (lowercase snake; keep stable once exported).
_CANONICAL_TO_METRIC_LABEL: dict[str, str] = {
    THRESHOLD_NOT_MET: "threshold_not_met",
    FRESHNESS_NOT_MET: "freshness_not_met",
    MODEL_POLICY_MISMATCH: "model_policy_mismatch",
    GOVERNANCE_BLOCKED: "governance_blocked",
    DATA_DRIFT_EXCEEDED: "data_drift_exceeded",
    LEGACY_COMPATIBILITY_FALLBACK: "legacy_compatibility_fallback",
    UNKNOWN_READINESS_REASON: "other",
}


def canonical_readiness_code(internal_code: str) -> str:
    """Map internal readiness ``code`` to a canonical uppercase code."""
    key = str(internal_code or "").strip().lower()
    if not key:
        return UNKNOWN_READINESS_REASON
    return _READINESS_CODE_TO_CANONICAL.get(key, UNKNOWN_READINESS_REASON)


def metric_label_for_canonical(canonical_code: str) -> str:
    """Prometheus-safe label for ``ELIGIBILITY_DENIED_TOTAL`` ``reason``."""
    cc = str(canonical_code or "").strip().upper()
    return _CANONICAL_TO_METRIC_LABEL.get(cc, "other")


def attach_canonical_to_reason_row(row: dict[str, str | Any]) -> dict[str, Any]:
    """Return a shallow copy of a reason dict with ``canonical_code`` set from ``code``."""
    out = dict(row)
    ic = str(out.get("code") or "").strip().lower()
    out["canonical_code"] = canonical_readiness_code(ic)
    return out
