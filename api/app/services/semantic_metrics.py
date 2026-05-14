"""Prometheus counters for semantic gating / eligibility (Phase 4 observability)."""

from __future__ import annotations

from typing import Any

try:
    from prometheus_client import Counter as _PrometheusCounter
except Exception:  # pragma: no cover - optional in lightweight dev/test envs
    _PrometheusCounter = None  # type: ignore[assignment]


class _NoopLabeled:
    def inc(self, _amount: float = 1.0) -> None:
        return None


class _NoopCounter:
    def labels(self, **_kwargs: Any) -> _NoopLabeled:
        return _NoopLabeled()


def _counter(name: str, documentation: str, labelnames: list[str]) -> Any:
    if _PrometheusCounter is None:
        return _NoopCounter()
    return _PrometheusCounter(name, documentation, labelnames)


READINESS_BLOCKED_TOTAL = _counter(
    "mlair_readiness_blocked_total",
    "Run blocked after create: declared dataset inputs below required size (execution readiness gate).",
    ["path"],
)

ELIGIBILITY_DENIED_TOTAL = _counter(
    "mlair_eligibility_denied_total",
    "POST .../readiness/evaluate persisted an evaluation with ready=false (dataset + policy eligibility).",
    ["source", "reason"],
)

_ALLOWED_READINESS_PATHS = frozenset({"runs_trigger", "pipeline_run"})
_ALLOWED_AUDIT_SOURCES = frozenset({"manual", "scheduler", "pre_training", "auto_policy", "api"})
_ALLOWED_DENIAL_REASONS = frozenset(
    {
        "size_threshold",
        "freshness",
        "model_compatibility",
        "approval",
        "validation_rules",
        "legacy_fallback",
        "unknown",
        "other",
    }
)


def normalize_audit_source(source: str | None) -> str:
    s = str(source or "manual").strip().lower() or "manual"
    return s if s in _ALLOWED_AUDIT_SOURCES else "other"


def primary_eligibility_denial_reason(result: dict[str, Any]) -> str:
    """Map evaluate_dataset_readiness payload to a low-cardinality reason label."""
    for r in result.get("reasons") or []:
        if isinstance(r, dict):
            code = str(r.get("code") or "").strip().lower()
            if code in _ALLOWED_DENIAL_REASONS:
                return code
            if code:
                return "other"
    for c in result.get("eligibility_criteria") or []:
        if isinstance(c, dict) and str(c.get("status") or "").lower() == "fail":
            code = str(c.get("code") or "").strip().lower()
            if code in _ALLOWED_DENIAL_REASONS:
                return code
            if code:
                return "other"
    return "unknown"


def record_readiness_blocked(*, path: str) -> None:
    p = str(path or "").strip().lower()
    if p not in _ALLOWED_READINESS_PATHS:
        p = "pipeline_run"
    READINESS_BLOCKED_TOTAL.labels(path=p).inc()


def record_eligibility_denied_persist(*, source: str | None, result: dict[str, Any]) -> None:
    if bool(result.get("ready")):
        return
    ELIGIBILITY_DENIED_TOTAL.labels(
        source=normalize_audit_source(source),
        reason=primary_eligibility_denial_reason(result),
    ).inc()
