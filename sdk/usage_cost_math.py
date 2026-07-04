"""Pure resource usage aggregation (CPU, memory, GPU samples — no monetary cost)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def normalize_resource_usage(raw: Any) -> dict[str, float | int | None]:
    out: dict[str, float | int | None] = {
        "duration_ms": None,
        "cpu_time_seconds": None,
        "memory_rss_kb": None,
        "gpu_seconds": None,
        "gpu_memory_mb_seconds": None,
        "disk_read_bytes": None,
        "disk_write_bytes": None,
    }
    if not isinstance(raw, dict):
        return out
    if raw.get("duration_seconds") is not None and out["duration_ms"] is None:
        try:
            out["duration_ms"] = int(max(0.0, float(raw["duration_seconds"])) * 1000)
        except (TypeError, ValueError):
            pass
    for key in out:
        val = raw.get(key)
        if val is None:
            continue
        try:
            if key in ("memory_rss_kb", "duration_ms", "disk_read_bytes", "disk_write_bytes"):
                out[key] = int(val)
            else:
                out[key] = float(val)
        except (TypeError, ValueError):
            continue
    return out


def _avg_peak(values: list[float]) -> tuple[float | None, float | None]:
    if not values:
        return None, None
    return sum(values) / len(values), max(values)


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    if pct <= 0:
        return min(values)
    if pct >= 100:
        return max(values)
    ordered = sorted(values)
    k = (len(ordered) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(ordered) - 1)
    if lo == hi:
        return ordered[lo]
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


def normalize_cpu_tree_percent(raw: float | None, *, logical_cpus: int | None = None) -> float | None:
    """Convert process-tree CPU delta to 0–100 utilization of effective quota.

    Uses cgroup CPU quota when present (e.g. 4-core container on 32-core host).
    """
    if raw is None:
        return None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if val <= 0:
        return 0.0
    if val <= 100:
        return min(100.0, val)
    try:
        from sdk.cgroup import effective_cpu_count

        cpus = effective_cpu_count(logical_cpus=logical_cpus)
    except Exception:
        cpus = logical_cpus
        if cpus is None:
            try:
                import psutil

                cpus = psutil.cpu_count(logical=True) or 1
            except Exception:
                cpus = 1
    normalized = val / max(1, int(cpus))
    return min(100.0, max(0.0, normalized))


def aggregate_samples(
    samples: list[tuple[Any, ...]],
    *,
    runtime_seconds: float,
    fallback_memory_mb: float | None,
) -> dict[str, float | int | None]:
    """Integrate heartbeat samples into memory_mb_seconds and avg/peak/p95 stats."""
    cpu_vals: list[float] = []
    mem_vals: list[float] = []
    gpu_util_vals: list[float] = []
    gpu_mem_vals: list[float] = []
    gpu_power_vals: list[float] = []
    gpu_temp_vals: list[float] = []
    net_rx_vals: list[float] = []
    net_tx_vals: list[float] = []

    parsed_mem: list[tuple[datetime, float]] = []
    peak_mb = fallback_memory_mb or 0.0

    for row in samples:
        ts = row[0] if isinstance(row[0], datetime) else parse_ts(row[0])
        cpu = row[1] if len(row) > 1 else None
        mem = row[2] if len(row) > 2 else None
        gpu_util = row[3] if len(row) > 3 else None
        gpu_mem = row[4] if len(row) > 4 else None
        net_rx = row[5] if len(row) > 5 else None
        net_tx = row[6] if len(row) > 6 else None
        gpu_power = row[7] if len(row) > 7 else None
        gpu_temp = row[8] if len(row) > 8 else None

        if cpu is not None:
            normalized = normalize_cpu_tree_percent(float(cpu))
            if normalized is not None:
                cpu_vals.append(normalized)
        if mem is not None:
            mem_f = float(mem)
            mem_vals.append(mem_f)
            peak_mb = max(peak_mb, mem_f)
            if ts is not None:
                parsed_mem.append((ts, mem_f))
        if gpu_util is not None:
            gpu_util_vals.append(float(gpu_util))
        if gpu_mem is not None:
            gpu_mem_vals.append(float(gpu_mem))
        if net_rx is not None:
            net_rx_vals.append(float(net_rx))
        if net_tx is not None:
            net_tx_vals.append(float(net_tx))
        if gpu_power is not None:
            gpu_power_vals.append(float(gpu_power))
        if gpu_temp is not None:
            gpu_temp_vals.append(float(gpu_temp))

    cpu_avg, cpu_peak = _avg_peak(cpu_vals)
    mem_avg, mem_peak = _avg_peak(mem_vals)
    if mem_peak is None and peak_mb > 0:
        mem_peak = peak_mb
    if mem_avg is None and mem_peak is not None:
        mem_avg = mem_peak

    gpu_util_avg, gpu_util_peak = _avg_peak(gpu_util_vals)
    gpu_mem_avg, gpu_mem_peak = _avg_peak(gpu_mem_vals)
    gpu_power_avg, gpu_power_peak = _avg_peak(gpu_power_vals)
    _, gpu_temp_peak = _avg_peak(gpu_temp_vals)
    net_rx_total = int(max(net_rx_vals)) if net_rx_vals else None
    net_tx_total = int(max(net_tx_vals)) if net_tx_vals else None

    mem_mb_seconds = 0.0
    parsed_mem.sort(key=lambda x: x[0])
    if len(parsed_mem) == 1:
        mem_mb_seconds = parsed_mem[0][1] * max(runtime_seconds, 0.0)
    elif len(parsed_mem) >= 2:
        for i in range(len(parsed_mem) - 1):
            t0, m0 = parsed_mem[i]
            t1, m1 = parsed_mem[i + 1]
            delta = max(0.0, (t1 - t0).total_seconds())
            mem_mb_seconds += ((m0 + m1) / 2.0) * delta
        _last_t, last_m = parsed_mem[-1]
        avg_gap = runtime_seconds / max(len(parsed_mem), 1)
        mem_mb_seconds += last_m * max(avg_gap * 0.5, 0.0)
    elif peak_mb > 0:
        mem_mb_seconds = peak_mb * max(runtime_seconds, 0.0)

    return {
        "memory_rss_peak_kb": int(peak_mb * 1024) if peak_mb > 0 else 0,
        "memory_mb_seconds": mem_mb_seconds,
        "sample_count": len(samples),
        "cpu_pct_avg": cpu_avg,
        "cpu_pct_peak": cpu_peak,
        "cpu_pct_p95": percentile(cpu_vals, 95),
        "memory_mb_avg": mem_avg,
        "memory_mb_peak": mem_peak,
        "gpu_util_pct_avg": gpu_util_avg,
        "gpu_util_pct_peak": gpu_util_peak,
        "gpu_memory_mb_avg": gpu_mem_avg,
        "gpu_memory_mb_peak": gpu_mem_peak,
        "gpu_power_w_avg": gpu_power_avg,
        "gpu_power_w_peak": gpu_power_peak,
        "gpu_temp_c_peak": gpu_temp_peak,
        "network_rx_bytes": net_rx_total,
        "network_tx_bytes": net_tx_total,
    }
