"""Dataset profiling and statistical drift detection (Phase 5.3)."""

from __future__ import annotations

import math
from typing import Any

from app.domains.lifecycle import lineage_service


def normalize_distribution(dist: dict[str, float]) -> dict[str, float]:
    total = sum(float(v) for v in dist.values())
    if total <= 0:
        return {}
    return {str(k): float(v) / total for k, v in dist.items()}


def compute_psi(baseline: dict[str, float], current: dict[str, float], *, epsilon: float = 1e-6) -> float:
    """Population Stability Index between two label distributions."""
    keys = set(baseline) | set(current)
    if not keys:
        return 0.0
    b = normalize_distribution(baseline)
    c = normalize_distribution(current)
    psi = 0.0
    for key in keys:
        pb = max(b.get(key, 0.0), epsilon)
        pc = max(c.get(key, 0.0), epsilon)
        psi += (pc - pb) * math.log(pc / pb)
    return float(psi)


def _coerce_label_map(value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
        return None
    out: dict[str, float] = {}
    for key, count in value.items():
        try:
            out[str(key)] = float(count)
        except (TypeError, ValueError):
            continue
    return out or None


def _profile_from_details(details: Any) -> dict[str, Any] | None:
    if isinstance(details, dict):
        if isinstance(details.get("profile"), dict):
            return dict(details["profile"])
        for field in ("label_distribution", "labels", "class_counts", "label_counts"):
            dist = _coerce_label_map(details.get(field))
            if dist:
                profile: dict[str, Any] = {"label_distribution": dist}
                if details.get("null_rate") is not None:
                    try:
                        profile["null_rate"] = float(details["null_rate"])
                    except (TypeError, ValueError):
                        pass
                if details.get("sample_count") is not None:
                    try:
                        profile["sample_count"] = int(details["sample_count"])
                    except (TypeError, ValueError):
                        pass
                return profile
    if isinstance(details, list):
        for item in details:
            if not isinstance(item, dict):
                continue
            field = str(item.get("field") or item.get("key") or "").strip().lower()
            if field in {"labels", "label_distribution", "class_counts", "label_counts"}:
                dist = _coerce_label_map(item.get("value"))
                if dist:
                    return {"label_distribution": dist}
    return None


def extract_label_profile(version: dict[str, Any]) -> dict[str, Any]:
    """Extract or build a quality profile from a dataset version row."""
    details = version.get("details")
    from_details = _profile_from_details(details)
    if from_details:
        return from_details
    record_count = int(version.get("record_count") or 0)
    return {
        "label_distribution": {},
        "sample_count": record_count,
        "null_rate": None,
    }


def build_version_quality_summary(version: dict[str, Any]) -> dict[str, Any]:
    profile = extract_label_profile(version)
    dist = profile.get("label_distribution") or {}
    sample_count = profile.get("sample_count")
    if sample_count is None:
        sample_count = int(version.get("record_count") or 0)
    return {
        "version_id": version.get("version_id"),
        "version": version.get("version"),
        "record_count": int(version.get("record_count") or 0),
        "quality_score": int(version.get("quality_score") or 0),
        "sample_count": int(sample_count or 0),
        "label_count": len(dist),
        "label_distribution": dist,
        "null_rate": profile.get("null_rate"),
    }


def parse_drift_policy(validation_rules: list[Any] | None) -> dict[str, Any] | None:
    for rule in validation_rules or []:
        if not isinstance(rule, dict):
            continue
        rule_type = str(rule.get("type") or rule.get("rule") or "").strip().lower()
        if rule_type in {"data_drift", "drift", "label_drift"}:
            return rule
    return None


def _resolve_baseline_version(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    current_version_id: str,
    baseline_version_id: str | None,
) -> dict[str, Any] | None:
    if baseline_version_id:
        return lineage_service.get_dataset_version(tenant_id, project_id, baseline_version_id)
    versions = lineage_service.list_dataset_versions(tenant_id, project_id, dataset_id)
    for idx, version in enumerate(versions):
        if str(version.get("version_id") or "") == current_version_id:
            if idx + 1 < len(versions):
                prev_id = str(versions[idx + 1].get("version_id") or "")
                return lineage_service.get_dataset_version(tenant_id, project_id, prev_id)
            return None
    return None


def compare_version_drift(from_v: dict[str, Any], to_v: dict[str, Any]) -> dict[str, Any]:
    from_profile = extract_label_profile(from_v)
    to_profile = extract_label_profile(to_v)
    from_dist = from_profile.get("label_distribution") or {}
    to_dist = to_profile.get("label_distribution") or {}
    psi = compute_psi(from_dist, to_dist) if from_dist and to_dist else None
    return {
        "psi": psi,
        "from_profile": from_profile,
        "to_profile": to_profile,
        "label_distribution_delta": {
            key: float(to_dist.get(key, 0.0)) - float(from_dist.get(key, 0.0))
            for key in sorted(set(from_dist) | set(to_dist))
        },
    }


def evaluate_drift_gate(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str,
    validation_rules: list[Any] | None,
) -> tuple[bool, dict[str, Any] | None]:
    """Return (passes, drift_report). Skips when no drift rule or no baseline profile."""
    rule = parse_drift_policy(validation_rules)
    if not rule:
        return True, None
    try:
        max_psi = float(rule.get("max_psi", 0.2))
    except (TypeError, ValueError):
        max_psi = 0.2
    current = lineage_service.get_dataset_version(tenant_id, project_id, dataset_version_id)
    if not current:
        return True, None
    baseline_id = str(rule.get("baseline_version_id") or "").strip() or None
    baseline = _resolve_baseline_version(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        current_version_id=dataset_version_id,
        baseline_version_id=baseline_id,
    )
    if not baseline:
        return True, {"skipped": True, "reason": "no_baseline_version"}
    drift = compare_version_drift(baseline, current)
    psi = drift.get("psi")
    exceeded = psi is not None and float(psi) > max_psi
    report = {
        **drift,
        "max_psi": max_psi,
        "drift_exceeded": exceeded,
        "baseline_version_id": baseline.get("version_id"),
        "current_version_id": current.get("version_id"),
    }
    return not exceeded, report
