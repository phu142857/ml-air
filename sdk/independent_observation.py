"""Kernel-backed resource observation (cgroup v1/v2 + procfs).

Worker/psutil telemetry remains advisory. Numbers here come from the kernel,
not from a worker-reported CPU percent.

Trust on read: TRUSTED (observed agrees), ADVISORY (worker only),
UNTRUSTED (mismatch or missing telemetry).
"""

from __future__ import annotations

import os
import socket
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TRUSTED = "TRUSTED"
ADVISORY = "ADVISORY"
UNTRUSTED = "UNTRUSTED"


def independent_observation_enabled() -> bool:
    return os.getenv("ML_AIR_INDEPENDENT_OBSERVATION_ENABLED", "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def telemetry_mismatch_rel_threshold() -> float:
    raw = os.getenv("ML_AIR_TELEMETRY_MISMATCH_REL", "0.25").strip()
    try:
        value = float(raw)
    except ValueError:
        return 0.25
    return value if value >= 0 else 0.25


def telemetry_mismatch_memory_mb_min() -> float:
    raw = os.getenv("ML_AIR_TELEMETRY_MISMATCH_MEM_MB", "1").strip()
    try:
        value = float(raw)
    except ValueError:
        return 1.0
    return value if value >= 0 else 1.0


def telemetry_mismatch_cpu_seconds_min() -> float:
    raw = os.getenv("ML_AIR_TELEMETRY_MISMATCH_CPU_SEC", "0.5").strip()
    try:
        value = float(raw)
    except ValueError:
        return 0.5
    return value if value >= 0 else 0.5


def _clk_tck() -> float:
    try:
        return float(os.sysconf("SC_CLK_TCK") or 100)
    except (OSError, ValueError, AttributeError):
        return 100.0


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def cgroup_relative_for_pid(pid: int) -> str | None:
    raw = _read_text(Path(f"/proc/{int(pid)}/cgroup"))
    if not raw:
        return None
    for line in raw.splitlines():
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        _hier, controllers, rel = parts[0], parts[1], parts[2]
        if controllers in ("", "0") or "memory" in controllers.split(",") or "cpu" in controllers.split(","):
            return rel.strip("/") or None
    return None


def _cgroup_roots() -> list[Path]:
    roots: list[Path] = []
    for env_key in ("ML_AIR_CGROUP_PATH", "MLAIR_CGROUP_PATH"):
        val = os.getenv(env_key, "").strip()
        if val:
            roots.append(Path(val))
    roots.append(Path("/sys/fs/cgroup"))
    return roots


def _cgroup_file(rel: str | None, *names: str) -> Path | None:
    rel_s = (rel or "").strip("/")
    for root in _cgroup_roots():
        bases = [root]
        if rel_s:
            bases.insert(0, root / rel_s)
        for base in bases:
            for name in names:
                path = base / name
                if path.is_file():
                    return path
    return None


def read_proc_rss_mb(pid: int) -> float | None:
    raw = _read_text(Path(f"/proc/{int(pid)}/status"))
    if not raw:
        return None
    for line in raw.splitlines():
        if line.startswith("VmRSS:"):
            parts = line.split()
            if len(parts) >= 2:
                try:
                    return float(parts[1]) / 1024.0
                except ValueError:
                    return None
    return None


def read_proc_cpu_time_seconds(pid: int) -> float | None:
    raw = _read_text(Path(f"/proc/{int(pid)}/stat"))
    if not raw:
        return None
    try:
        rparen = raw.rfind(")")
        fields = raw[rparen + 1 :].split()
        utime = int(fields[11])
        stime = int(fields[12])
    except (ValueError, IndexError):
        return None
    return (utime + stime) / _clk_tck()


def read_cgroup_memory_mb(rel: str | None) -> float | None:
    path = _cgroup_file(rel, "memory.current", "memory.usage_in_bytes")
    if path is None:
        return None
    raw = (_read_text(path) or "").strip()
    try:
        return float(raw.split()[0]) / (1024.0 * 1024.0)
    except (ValueError, IndexError):
        return None


def read_cgroup_cpu_usage_usec(rel: str | None) -> int | None:
    path = _cgroup_file(rel, "cpu.stat")
    if path is not None:
        raw = _read_text(path) or ""
        for line in raw.splitlines():
            if line.startswith("usage_usec"):
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        return int(parts[1])
                    except ValueError:
                        return None
    usage = _cgroup_file(rel, "cpuacct.usage")
    if usage is None:
        return None
    raw = (_read_text(usage) or "").strip()
    try:
        ns = int(raw.split()[0])
        return ns // 1000
    except (ValueError, IndexError):
        return None


def snapshot_pid(pid: int) -> dict[str, Any]:
    """One kernel snapshot. Missing files yield None fields, not worker guesses."""
    rel = cgroup_relative_for_pid(pid)
    proc_rss = read_proc_rss_mb(pid)
    cgroup_mem = read_cgroup_memory_mb(rel)
    memory_mb = proc_rss if proc_rss is not None else cgroup_mem
    source = "none"
    if rel and (cgroup_mem is not None or read_cgroup_cpu_usage_usec(rel) is not None):
        source = "cgroup"
    elif proc_rss is not None or read_proc_cpu_time_seconds(pid) is not None:
        source = "procfs"
    return {
        "sampled_at": datetime.now(timezone.utc).isoformat(),
        "pid": int(pid),
        "cgroup_path": rel,
        "memory_mb": memory_mb,
        "proc_rss_mb": proc_rss,
        "cgroup_memory_mb": cgroup_mem,
        "cpu_time_seconds": read_proc_cpu_time_seconds(pid),
        "cgroup_cpu_usage_usec": read_cgroup_cpu_usage_usec(rel),
        "observation_source": source,
    }


def build_resource_identity(
    *,
    pid: int,
    worker_id: str | None = None,
    hostname: str | None = None,
) -> dict[str, Any]:
    rel = cgroup_relative_for_pid(pid)
    return {
        "pid": int(pid),
        "cgroup_path": rel,
        "hostname": hostname or socket.gethostname(),
        "worker_id": (worker_id or os.getenv("HOSTNAME") or "internal-executor").strip(),
    }


class IndependentObserver:
    """Background sampler reading kernel cgroup/procfs for a PID."""

    def __init__(self, *, interval_seconds: float | None = None) -> None:
        raw = os.getenv("ML_AIR_INDEPENDENT_OBSERVE_INTERVAL", "1").strip()
        try:
            default_iv = max(0.25, float(raw))
        except ValueError:
            default_iv = 1.0
        self.interval_seconds = interval_seconds if interval_seconds is not None else default_iv
        self._pid: int | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._samples: list[dict[str, Any]] = []
        self._started_at: float | None = None
        self._cpu0: float | None = None
        self._cgroup_cpu0: int | None = None
        self._identity: dict[str, Any] | None = None

    def start(self, pid: int, *, worker_id: str | None = None) -> None:
        self._pid = int(pid)
        self._identity = build_resource_identity(pid=self._pid, worker_id=worker_id)
        self._started_at = time.perf_counter()
        first = snapshot_pid(self._pid)
        self._cpu0 = first.get("cpu_time_seconds")
        self._cgroup_cpu0 = first.get("cgroup_cpu_usage_usec")
        with self._lock:
            self._samples = [first]
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="mlair-cgroup-observe", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            if self._pid is None:
                break
            snap = snapshot_pid(self._pid)
            if snap.get("observation_source") == "none" and snap.get("memory_mb") is None:
                break
            with self._lock:
                self._samples.append(snap)

    def stop(self) -> dict[str, Any]:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        wall = 0.0
        if self._started_at is not None:
            wall = max(0.0, time.perf_counter() - self._started_at)
        with self._lock:
            samples = list(self._samples)
        last = samples[-1] if samples else {}
        mems = [float(s["memory_mb"]) for s in samples if s.get("memory_mb") is not None]
        cpu_last = last.get("cpu_time_seconds")
        cpu_delta = None
        if cpu_last is not None and self._cpu0 is not None:
            cpu_delta = max(0.0, float(cpu_last) - float(self._cpu0))
        cgroup_last = last.get("cgroup_cpu_usage_usec")
        cpu_percent_peak = None
        if wall > 0 and cpu_delta is not None:
            cpu_percent_peak = min(100.0 * max(1, os.cpu_count() or 1), (cpu_delta / wall) * 100.0)
        if wall > 0 and cgroup_last is not None and self._cgroup_cpu0 is not None:
            usec = max(0, int(cgroup_last) - int(self._cgroup_cpu0))
            cgroup_pct = (usec / 1_000_000.0) / wall * 100.0
            if cpu_percent_peak is None:
                cpu_percent_peak = cgroup_pct
            else:
                cpu_percent_peak = max(cpu_percent_peak, cgroup_pct)
        source = str(last.get("observation_source") or "none")
        if source == "none" and samples:
            for s in reversed(samples):
                if s.get("observation_source") not in (None, "none"):
                    source = str(s["observation_source"])
                    break
        observed = {
            "cpu_time_seconds": cpu_delta,
            "memory_mb_peak": max(mems) if mems else None,
            "cpu_percent_peak": cpu_percent_peak,
            "sample_count": len(samples),
            "duration_seconds": wall if wall > 0 else None,
            "observation_source": source,
        }
        return {
            "resource_identity": self._identity
            or (build_resource_identity(pid=self._pid) if self._pid else None),
            "observed_usage": observed,
        }


def _finite(value: Any) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if out != out:  # NaN
        return None
    return out


def _has_kernel_observation(observed: dict[str, Any] | None) -> bool:
    if not observed:
        return False
    if observed.get("observation_source") in (None, "", "none"):
        return False
    return (
        observed.get("memory_mb_peak") is not None
        or observed.get("cpu_time_seconds") is not None
        or observed.get("cpu_percent_peak") is not None
    )


def _reported_cpu_seconds(reported: dict[str, Any] | None) -> float | None:
    if not reported:
        return None
    for key in ("cpu_seconds", "cpu_time_seconds"):
        value = _finite(reported.get(key))
        if value is not None:
            return value
    return None


def _reported_memory_mb(reported: dict[str, Any] | None) -> float | None:
    if not reported:
        return None
    peak = _finite(reported.get("memory_mb_peak"))
    if peak is not None:
        return peak
    kb = _finite(reported.get("memory_rss_peak_kb"))
    if kb is not None:
        return kb / 1024.0
    return None


def _has_reported_metrics(reported: dict[str, Any] | None) -> bool:
    return _reported_cpu_seconds(reported) is not None or _reported_memory_mb(reported) is not None


def _relative_mismatch(observed: float, reported: float, *, abs_min: float, rel: float) -> bool:
    if abs(observed - reported) < abs_min:
        return False
    denom = max(abs(observed), abs(reported), 1e-9)
    return abs(observed - reported) / denom > rel


def usage_mismatch(*, reported: dict[str, Any] | None, observed: dict[str, Any] | None) -> bool:
    """True when worker report and kernel observation disagree beyond thresholds."""
    if not reported or not observed:
        return False
    rel = telemetry_mismatch_rel_threshold()
    obs_mem = _finite(observed.get("memory_mb_peak"))
    rep_mem = _reported_memory_mb(reported)
    if obs_mem is not None and rep_mem is not None:
        if _relative_mismatch(
            obs_mem, rep_mem, abs_min=telemetry_mismatch_memory_mb_min(), rel=rel
        ):
            return True
    obs_cpu = _finite(observed.get("cpu_time_seconds"))
    rep_cpu = _reported_cpu_seconds(reported)
    if obs_cpu is not None and rep_cpu is not None:
        if _relative_mismatch(
            obs_cpu, rep_cpu, abs_min=telemetry_mismatch_cpu_seconds_min(), rel=rel
        ):
            return True
    return False


def classify_telemetry_trust(
    *,
    reported: dict[str, Any] | None,
    observed: dict[str, Any] | None,
) -> tuple[str, str]:
    """Return (TRUSTED|ADVISORY|UNTRUSTED, reason).

    TRUSTED: kernel observation exists and agrees with the worker (or no worker metrics).
    ADVISORY: only worker/psutil report exists.
    UNTRUSTED: mismatch, or neither source produced metrics.
    """
    has_observed = _has_kernel_observation(observed)
    has_reported = _has_reported_metrics(reported)
    if not has_observed and not has_reported:
        return UNTRUSTED, "missing"
    if not has_observed:
        return ADVISORY, "worker_only"
    if has_reported and usage_mismatch(reported=reported, observed=observed):
        return UNTRUSTED, "mismatch"
    return TRUSTED, "observed"


def prefer_observed_usage(
    *,
    reported: dict[str, Any] | None,
    observed: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build API attribution: observed is source of truth when kernel samples exist."""
    reported_u = dict(reported) if isinstance(reported, dict) else None
    observed_u = dict(observed) if isinstance(observed, dict) else None
    has_observed = _has_kernel_observation(observed_u)
    trust, reason = classify_telemetry_trust(reported=reported_u, observed=observed_u)
    usage = dict(reported_u) if reported_u else {}
    if has_observed and observed_u:
        if observed_u.get("cpu_time_seconds") is not None:
            usage["cpu_seconds"] = float(observed_u["cpu_time_seconds"])
        if observed_u.get("memory_mb_peak") is not None:
            usage["memory_mb_peak"] = float(observed_u["memory_mb_peak"])
            usage["memory_rss_peak_kb"] = int(float(observed_u["memory_mb_peak"]) * 1024)
        if observed_u.get("cpu_percent_peak") is not None:
            usage["cpu_pct_peak"] = float(observed_u["cpu_percent_peak"])
        if observed_u.get("duration_seconds") is not None:
            usage["runtime_seconds"] = float(observed_u["duration_seconds"])
    return {
        "usage": usage or reported_u,
        "reported_usage": reported_u,
        "observed_usage": observed_u,
        "attribution_source": "observed" if has_observed else "reported",
        "telemetry_trust": trust,
        "trust_reason": reason,
    }

