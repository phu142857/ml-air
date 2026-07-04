"""Linux cgroup CPU quota detection (v1 + v2).

Used to normalize CPU% against the effective quota (e.g. 4 cores in a
container) instead of the full host (e.g. 32 cores).
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


def _read_int(path: Path) -> int | None:
    try:
        raw = path.read_text(encoding="utf-8").strip()
        if not raw or raw.lower() in {"max", "max\n"}:
            return None
        return int(raw.split()[0])
    except (OSError, ValueError):
        return None


def _read_cpu_max(path: Path) -> float | None:
    """Parse cgroup v2 cpu.max: ``<quota> <period>`` or ``max``."""
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not raw or raw.lower().startswith("max"):
        return None
    parts = raw.split()
    if len(parts) < 2:
        return None
    try:
        quota = int(parts[0])
        period = int(parts[1])
    except ValueError:
        return None
    if quota <= 0 or period <= 0:
        return None
    return quota / period


def _cgroup_mount_paths() -> list[Path]:
    paths: list[Path] = []
    for env_key in ("ML_AIR_CGROUP_PATH", "MLAIR_CGROUP_PATH"):
        val = os.getenv(env_key, "").strip()
        if val:
            paths.append(Path(val))
    paths.extend(
        [
            Path("/sys/fs/cgroup"),
            Path(f"/proc/{os.getpid()}/root/sys/fs/cgroup"),
        ]
    )
    return paths


def _self_cgroup_relative() -> str | None:
    try:
        lines = Path("/proc/self/cgroup").read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        _hier, controllers, rel = parts[0], parts[1], parts[2]
        if controllers in ("", "0") or "cpu" in controllers.split(","):
            return rel.strip("/") or None
    return None


def _resolve_cpu_max_files() -> list[Path]:
    rel = _self_cgroup_relative()
    candidates: list[Path] = []
    for root in _cgroup_mount_paths():
        if rel:
            candidates.append(root / rel / "cpu.max")
        candidates.append(root / "cpu.max")
        candidates.append(root / "cpu" / "cpu.max")
    return candidates


def _resolve_cpu_cfs_files() -> tuple[Path | None, Path | None]:
    rel = _self_cgroup_relative()
    quota: Path | None = None
    period: Path | None = None
    for root in _cgroup_mount_paths():
        bases = [root]
        if rel:
            bases.append(root / rel)
        for base in bases:
            q = base / "cpu.cfs_quota_us"
            p = base / "cpu.cfs_period_us"
            if q.is_file() and p.is_file():
                return q, p
            q2 = base / "cpu" / "cpu.cfs_quota_us"
            p2 = base / "cpu" / "cpu.cfs_period_us"
            if q2.is_file() and p2.is_file():
                return q2, p2
    return quota, period


@lru_cache(maxsize=1)
def cpu_quota_cores() -> float | None:
    """Effective CPU cores from cgroup quota, or ``None`` if unlimited."""
    for cpu_max in _resolve_cpu_max_files():
        cores = _read_cpu_max(cpu_max)
        if cores is not None and cores > 0:
            return cores

    quota_path, period_path = _resolve_cpu_cfs_files()
    if quota_path and period_path:
        quota = _read_int(quota_path)
        period = _read_int(period_path)
        if quota is not None and period is not None and quota > 0 and period > 0:
            return quota / period
    return None


def effective_cpu_count(*, logical_cpus: int | None = None) -> int:
    """Logical CPUs capped by cgroup quota when present."""
    cpus = logical_cpus
    if cpus is None:
        try:
            import psutil

            cpus = psutil.cpu_count(logical=True) or 1
        except Exception:
            cpus = 1
    quota = cpu_quota_cores()
    if quota is not None and quota > 0:
        return max(1, min(int(cpus), max(1, int(round(quota)))))
    return max(1, int(cpus))
