"""MLAir Resource Usage Contract v1 — worker-agnostic peaks and totals."""

from __future__ import annotations

from typing import Any

from sdk.usage_cost_math import aggregate_samples, normalize_cpu_tree_percent, normalize_resource_usage, parse_ts

CONTRACT_VERSION = "v1"

# Complete / summary (peaks + totals). All percents are 0–100 machine utilization on the worker host.
CONTRACT_SUMMARY_KEYS = (
    "duration_seconds",
    "cpu_time_seconds",
    "cpu_percent_peak",
    "memory_mb_peak",
    "gpu_percent_peak",
    "gpu_memory_mb_peak",
    "disk_read_bytes",
    "disk_write_bytes",
)

# Live heartbeat sample keys (same scale as contract).
CONTRACT_HEARTBEAT_KEYS = (
    "cpu_percent",
    "memory_mb",
    "gpu_util_percent",
    "gpu_memory_mb",
)

# v1 peak aliases on resource_usage → task_usage stat columns
_CONTRACT_PEAK_TO_STAT: tuple[tuple[str, str], ...] = (
    ("cpu_percent_peak", "cpu_pct_peak"),
    ("memory_mb_peak", "memory_mb_peak"),
    ("gpu_percent_peak", "gpu_util_pct_peak"),
    ("gpu_util_percent_peak", "gpu_util_pct_peak"),
    ("gpu_memory_mb_peak", "gpu_memory_mb_peak"),
)


def _float_val(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _int_val(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def sample_dicts_to_rows(samples: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    for sample in samples:
        if not isinstance(sample, dict):
            continue
        rows.append(
            (
                parse_ts(sample.get("sampled_at")),
                sample.get("cpu_percent"),
                sample.get("memory_mb"),
                sample.get("gpu_util_percent"),
                sample.get("gpu_memory_mb"),
            )
        )
    return rows


def normalize_contract_resource_usage(raw: Any) -> dict[str, float | int | None]:
    """Parse resource_usage accepting legacy ingest fields and contract v1 peaks."""
    base = normalize_resource_usage(raw)
    if not isinstance(raw, dict):
        return base

    duration_seconds = _float_val(raw.get("duration_seconds"))
    if duration_seconds is not None and duration_seconds > 0 and base.get("duration_ms") is None:
        base["duration_ms"] = int(duration_seconds * 1000)

    mem_peak = _float_val(raw.get("memory_mb_peak"))
    if mem_peak is not None and mem_peak > 0 and base.get("memory_rss_kb") is None:
        base["memory_rss_kb"] = int(mem_peak * 1024)

    return base


def extract_contract_peaks(raw: Any) -> dict[str, float | None]:
    """Peak overrides from a v1 complete payload (used when samples are sparse)."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, float | None] = {}
    for contract_key, stat_key in _CONTRACT_PEAK_TO_STAT:
        val = _float_val(raw.get(contract_key))
        if val is not None:
            if contract_key.startswith("cpu") and val > 100:
                val = normalize_cpu_tree_percent(val)
            out[stat_key] = val
    return out


def merge_peak_stats(stats: dict[str, float | None], peaks: dict[str, float | None]) -> dict[str, float | None]:
    merged = dict(stats)
    for key, val in peaks.items():
        if val is not None:
            merged[key] = val
    return merged


def contract_summary_from_report(report: dict[str, Any]) -> dict[str, Any]:
    """Build contract v1 summary from ``TaskResourceMonitor.build_report()`` output."""
    ru = report.get("resource_usage") if isinstance(report.get("resource_usage"), dict) else {}
    samples = report.get("usage_samples") if isinstance(report.get("usage_samples"), list) else []

    duration_seconds: float | None = None
    if ru.get("duration_ms") is not None:
        duration_seconds = max(0.0, float(ru["duration_ms"]) / 1000.0)

    fallback_mb = (float(ru["memory_rss_kb"]) / 1024.0) if ru.get("memory_rss_kb") else None
    agg = aggregate_samples(
        sample_dicts_to_rows(samples),
        runtime_seconds=duration_seconds or 0.0,
        fallback_memory_mb=fallback_mb,
    )

    summary: dict[str, Any] = {
        "duration_seconds": duration_seconds,
        "cpu_time_seconds": ru.get("cpu_time_seconds"),
        "cpu_percent_peak": agg.get("cpu_pct_peak"),
        "memory_mb_peak": agg.get("memory_mb_peak"),
        "gpu_percent_peak": agg.get("gpu_util_pct_peak"),
        "gpu_memory_mb_peak": agg.get("gpu_memory_mb_peak"),
        "disk_read_bytes": ru.get("disk_read_bytes"),
        "disk_write_bytes": ru.get("disk_write_bytes"),
    }
    return {k: v for k, v in summary.items() if v is not None}


def contract_complete_resource_usage(report: dict[str, Any]) -> dict[str, Any]:
    """``resource_usage`` object for task complete/fail (legacy + v1 fields)."""
    ru = dict(report.get("resource_usage") or {}) if isinstance(report.get("resource_usage"), dict) else {}
    summary = contract_summary_from_report(report)
    out: dict[str, Any] = {**ru}
    for key in CONTRACT_SUMMARY_KEYS:
        val = summary.get(key)
        if val is not None:
            out[key] = val
    if out.get("duration_seconds") and not out.get("duration_ms"):
        out["duration_ms"] = int(float(out["duration_seconds"]) * 1000)
    if summary.get("memory_mb_peak") is not None and out.get("memory_rss_kb") is None:
        out["memory_rss_kb"] = int(float(summary["memory_mb_peak"]) * 1024)
    return {k: v for k, v in out.items() if v is not None}


def contract_heartbeat_from_sample(sample: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(sample, dict) or not sample:
        return None
    out: dict[str, Any] = {}
    for key in CONTRACT_HEARTBEAT_KEYS:
        val = sample.get(key)
        if val is not None:
            if key == "cpu_percent":
                cpu = _float_val(val)
                if cpu is not None and cpu > 100:
                    cpu = normalize_cpu_tree_percent(cpu)
                out[key] = cpu
            else:
                out[key] = val
    return out or None
