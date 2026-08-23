"""Prometheus counters for semantic gating / eligibility (Phase 4 observability)."""

from __future__ import annotations

from typing import Any

from app.domains.observability.metric_labels import normalize_label, sanitize_label_value

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
    try:
        return _PrometheusCounter(name, documentation, labelnames)
    except ValueError:
        from prometheus_client import REGISTRY

        collectors = getattr(REGISTRY, "_names_to_collectors", {}) or {}
        existing = collectors.get(name)
        if existing is None and name.endswith("_total"):
            existing = collectors.get(name[: -len("_total")])
        return existing or _NoopCounter()


READINESS_BLOCKED_TOTAL = _counter(
    "mlair_readiness_blocked_total",
    "Run blocked after create: declared dataset inputs below required size (execution readiness gate).",
    ["path", "tenant_id"],
)

ELIGIBILITY_DENIED_TOTAL = _counter(
    "mlair_eligibility_denied_total",
    "POST .../readiness/evaluate persisted an evaluation with ready=false (dataset + policy eligibility).",
    ["source", "reason", "tenant_id"],
)

ADMISSION_DECISION_TOTAL = _counter(
    "mlair_admission_decision_total",
    "Governance-aware admission decisions (ACCEPT, REJECT, DEFER).",
    ["decision", "reason", "tenant_id"],
)

_ALLOWED_READINESS_PATHS = frozenset({"runs_trigger", "pipeline_run"})
_ALLOWED_AUDIT_SOURCES = frozenset({"manual", "scheduler", "pre_training", "auto_policy", "api"})


def normalize_audit_source(source: str | None) -> str:
    return normalize_label(str(source or "manual"), _ALLOWED_AUDIT_SOURCES, default="other")


def normalize_tenant_metric_label(tenant_id: str | None) -> str:
    """Low-cardinality tenant slug for Prometheus (Wave 1 tenant-aware alerts)."""
    return sanitize_label_value(tenant_id or "unknown")


def primary_eligibility_denial_reason(result: dict[str, Any]) -> str:
    """Map evaluate_dataset_readiness payload to a low-cardinality Prometheus ``reason`` label."""
    from app.domains.lifecycle.canonical_codes import canonical_readiness_code, metric_label_for_canonical

    for r in result.get("reasons") or []:
        if isinstance(r, dict):
            cc_raw = str(r.get("canonical_code") or "").strip().upper()
            ic = str(r.get("code") or "").strip().lower()
            canonical = cc_raw if cc_raw else canonical_readiness_code(ic)
            return metric_label_for_canonical(canonical)
    for c in result.get("eligibility_criteria") or []:
        if isinstance(c, dict) and str(c.get("status") or "").lower() == "fail":
            cc_raw = str(c.get("canonical_code") or "").strip().upper()
            ic = str(c.get("code") or "").strip().lower()
            canonical = cc_raw if cc_raw else canonical_readiness_code(ic)
            return metric_label_for_canonical(canonical)
    return "unknown"


def record_readiness_blocked(*, path: str, tenant_id: str | None = None) -> None:
    p = normalize_label(path, _ALLOWED_READINESS_PATHS, default="pipeline_run")
    READINESS_BLOCKED_TOTAL.labels(path=p, tenant_id=normalize_tenant_metric_label(tenant_id)).inc()


def record_eligibility_denied_persist(
    *,
    source: str | None,
    result: dict[str, Any],
    tenant_id: str | None = None,
) -> None:
    if bool(result.get("ready")):
        return
    ELIGIBILITY_DENIED_TOTAL.labels(
        source=normalize_audit_source(source),
        reason=primary_eligibility_denial_reason(result),
        tenant_id=normalize_tenant_metric_label(tenant_id),
    ).inc()


_ALLOWED_ADMISSION_DECISIONS = frozenset({"accept", "reject", "defer"})
_ALLOWED_ADMISSION_REASONS = frozenset(
    {
        "ok",
        "policy_blocked",
        "tenant_quota",
        "resource_capacity",
        "resource_busy",
        "tenant_budget",
        "pipeline_inputs_not_ready",
        "mlair_readiness_not_eligible",
        "governance_blocked",
        "training_policy_required",
        "dataset_version_not_found",
    }
)


def record_admission_decision(*, decision: str, reason: str, tenant_id: str | None = None) -> None:
    d = normalize_label(str(decision or ""), _ALLOWED_ADMISSION_DECISIONS, default="reject")
    r = normalize_label(str(reason or "ok"), _ALLOWED_ADMISSION_REASONS, default="other")
    ADMISSION_DECISION_TOTAL.labels(
        decision=d,
        reason=r,
        tenant_id=normalize_tenant_metric_label(tenant_id),
    ).inc()
