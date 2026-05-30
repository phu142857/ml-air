"""Local PID-scoped resource monitor (psutil + optional NVML).

Samples are buffered in-memory and reported in one batch on task completion
(Hybrid A: collect at executor, C: batch report on complete/fail).
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("mlair.resource_monitor")

try:
    import psutil
except ImportError:  # pragma: no cover - optional at import in minimal envs
    psutil = None  # type: ignore[assignment]


def resource_monitor_enabled() -> bool:
    return os.getenv("ML_AIR_RESOURCE_MONITOR_ENABLED", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def default_sample_interval_seconds() -> float:
    raw = os.getenv("ML_AIR_RESOURCE_SAMPLE_INTERVAL", "1").strip()
    try:
        return max(0.25, float(raw))
    except ValueError:
        return 1.0


def default_flush_interval_seconds() -> float:
    raw = os.getenv("ML_AIR_RESOURCE_FLUSH_INTERVAL", "1").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 30.0


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskResourceMonitor:
    """Background sampler for a process tree rooted at ``root_pid``."""

    def __init__(
        self,
        *,
        task_id: str | None = None,
        interval_seconds: float | None = None,
        flush_interval_seconds: float | None = None,
    ) -> None:
        self.task_id = str(task_id or "").strip() or None
        self.interval_seconds = interval_seconds if interval_seconds is not None else default_sample_interval_seconds()
        self.flush_interval_seconds = (
            flush_interval_seconds if flush_interval_seconds is not None else default_flush_interval_seconds()
        )
        self._root_pid: int | None = None
        self._samples: list[dict[str, Any]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._started_at: float | None = None
        self._cpu_times0: float = 0.0
        self._disk_io0: tuple[int, int] | None = None
        self._gpu_seconds_acc = 0.0
        self._gpu_mem_mb_seconds_acc = 0.0
        self._last_flush_at = 0.0
        self._lock = threading.Lock()

    @property
    def root_pid(self) -> int | None:
        return self._root_pid

    def start(self, pid: int) -> None:
        if psutil is None:
            logger.warning("resource_monitor_psutil_missing")
            return
        if self._thread and self._thread.is_alive():
            self.attach_pid(pid)
            return
        self.attach_pid(pid)
        self._stop.clear()
        self._thread = threading.Thread(target=self._sample_loop, name="mlair-resource-monitor", daemon=True)
        self._thread.start()

    def attach_pid(self, pid: int) -> None:
        """Retarget monitoring to ``pid`` (e.g. plugin subprocess)."""
        if psutil is None:
            return
        self._root_pid = int(pid)
        self._started_at = time.perf_counter()
        self._cpu_times0 = self._cpu_time_seconds_tree(self._root_pid)
        self._disk_io0 = self._disk_io_tree(self._root_pid)
        for proc in self._process_tree(self._root_pid):
            try:
                proc.cpu_percent(interval=None)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    def stop(self) -> dict[str, Any]:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.interval_seconds + 3.0)
        self._thread = None
        return self.build_report()

    def build_report(self) -> dict[str, Any]:
        wall_seconds = 0.0
        if self._started_at is not None:
            wall_seconds = max(0.0, time.perf_counter() - self._started_at)

        with self._lock:
            samples = list(self._samples)

        cpu_seconds = 0.0
        disk_read = None
        disk_write = None
        if self._root_pid is not None and psutil is not None:
            cpu_end = self._cpu_time_seconds_tree(self._root_pid)
            cpu_seconds = max(0.0, cpu_end - self._cpu_times0)
            disk_end = self._disk_io_tree(self._root_pid)
            if self._disk_io0 is not None and disk_end is not None:
                disk_read = max(0, disk_end[0] - self._disk_io0[0])
                disk_write = max(0, disk_end[1] - self._disk_io0[1])

        memory_rss_kb = None
        if samples:
            peak_mb = max(float(s["memory_mb"]) for s in samples if s.get("memory_mb") is not None)
            memory_rss_kb = int(peak_mb * 1024)
        elif self._root_pid is not None and psutil is not None:
            rss = self._memory_rss_bytes_tree(self._root_pid)
            if rss > 0:
                memory_rss_kb = int(rss / 1024)

        gpu_seconds = self._gpu_seconds_acc if self._gpu_seconds_acc > 0 else None
        gpu_mem_mb_seconds = self._gpu_mem_mb_seconds_acc if self._gpu_mem_mb_seconds_acc > 0 else None

        resource_usage: dict[str, Any] = {
            "duration_ms": int(wall_seconds * 1000) if wall_seconds > 0 else None,
            "cpu_time_seconds": cpu_seconds if cpu_seconds > 0 else None,
            "memory_rss_kb": memory_rss_kb,
            "gpu_seconds": gpu_seconds,
            "gpu_memory_mb_seconds": gpu_mem_mb_seconds,
            "disk_read_bytes": disk_read,
            "disk_write_bytes": disk_write,
        }

        return {
            "resource_usage": resource_usage,
            "usage_samples": samples,
            "resource_monitor": {
                "root_pid": self._root_pid,
                "sample_count": len(samples),
                "sample_interval_seconds": self.interval_seconds,
            },
        }

    def _sample_loop(self) -> None:
        if psutil is None or self._root_pid is None:
            return
        last_sample: dict[str, Any] | None = None
        next_sample_at = time.monotonic()
        flush_tick = self._loop_tick_seconds()
        while not self._stop.is_set():
            now = time.monotonic()
            if now >= next_sample_at:
                sample = self._sample_once()
                if sample is not None:
                    with self._lock:
                        self._samples.append(sample)
                        if sample.get("gpu_util_percent") is not None and float(sample["gpu_util_percent"]) > 0:
                            self._gpu_seconds_acc += self.interval_seconds
                        if sample.get("gpu_memory_mb") is not None:
                            self._gpu_mem_mb_seconds_acc += float(sample["gpu_memory_mb"]) * self.interval_seconds
                    last_sample = sample
                next_sample_at = now + self.interval_seconds

            if last_sample is not None:
                self._maybe_flush_sample(last_sample, refresh_timestamp=True)

            sleep_for = min(flush_tick, max(0.05, next_sample_at - time.monotonic()))
            if self._stop.wait(sleep_for):
                break

    def _loop_tick_seconds(self) -> float:
        if self.flush_interval_seconds > 0:
            return max(0.05, min(self.interval_seconds, self.flush_interval_seconds))
        return max(0.05, self.interval_seconds)

    def _maybe_flush_sample(self, sample: dict[str, Any], *, refresh_timestamp: bool = False) -> None:
        if not self.task_id or self.flush_interval_seconds <= 0:
            return
        now = time.monotonic()
        if now - self._last_flush_at < self.flush_interval_seconds:
            return
        self._last_flush_at = now
        flush_sample = {**sample, "sampled_at": _iso_now()} if refresh_timestamp else sample
        try:
            from sdk.usage_cost import persist_usage_samples, usage_tracking_enabled

            if usage_tracking_enabled():
                persist_usage_samples(task_id=self.task_id, samples=[flush_sample])
        except Exception:
            logger.exception("resource_monitor_flush_failed task_id=%s", self.task_id)

    def _sample_once(self) -> dict[str, Any] | None:
        if self._root_pid is None or psutil is None:
            return None
        procs = self._process_tree(self._root_pid)
        if not procs:
            return None

        cpu_pct = 0.0
        mem_bytes = 0
        pids: set[int] = set()
        for proc in procs:
            pids.add(proc.pid)
            try:
                cpu_pct += float(proc.cpu_percent(interval=None))
                mem_bytes += int(proc.memory_info().rss)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        gpu_util, gpu_mem_mb = _gpu_stats_for_pids(pids)

        from sdk.usage_cost_math import normalize_cpu_tree_percent

        cpu_pct = normalize_cpu_tree_percent(cpu_pct) or 0.0

        return {
            "sampled_at": _iso_now(),
            "cpu_percent": cpu_pct,
            "memory_mb": mem_bytes / (1024.0 * 1024.0) if mem_bytes > 0 else 0.0,
            "gpu_util_percent": gpu_util,
            "gpu_memory_mb": gpu_mem_mb,
        }

    @staticmethod
    def _process_tree(root_pid: int) -> list[Any]:
        if psutil is None:
            return []
        try:
            root = psutil.Process(root_pid)
        except psutil.NoSuchProcess:
            return []
        procs = [root]
        try:
            procs.extend(root.children(recursive=True))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        alive: list[Any] = []
        for proc in procs:
            try:
                if proc.is_running():
                    alive.append(proc)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return alive

    def _cpu_time_seconds_tree(self, root_pid: int) -> float:
        total = 0.0
        for proc in self._process_tree(root_pid):
            try:
                ct = proc.cpu_times()
                total += float(ct.user + ct.system)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return total

    def _memory_rss_bytes_tree(self, root_pid: int) -> int:
        total = 0
        for proc in self._process_tree(root_pid):
            try:
                total += int(proc.memory_info().rss)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return total

    @staticmethod
    def _disk_io_tree(root_pid: int) -> tuple[int, int] | None:
        if psutil is None:
            return None
        read_total = 0
        write_total = 0
        seen = False
        try:
            root = psutil.Process(root_pid)
            procs = [root] + root.children(recursive=True)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
        for proc in procs:
            try:
                io = proc.io_counters()
                read_total += int(io.read_bytes)
                write_total += int(io.write_bytes)
                seen = True
            except (psutil.NoSuchProcess, psutil.AccessDenied, AttributeError):
                continue
        return (read_total, write_total) if seen else None


def _gpu_stats_for_pids(pids: set[int]) -> tuple[float | None, float | None]:
    if not pids:
        return None, None
    try:
        import pynvml  # type: ignore[import-untyped]
    except ImportError:
        return None, None

    try:
        pynvml.nvmlInit()
    except Exception:
        return None, None

    util_peak: float | None = None
    mem_peak_mb: float | None = None
    try:
        device_count = pynvml.nvmlDeviceGetCount()
        for idx in range(device_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                if util_peak is None or float(util.gpu) > util_peak:
                    util_peak = float(util.gpu)
            except Exception:
                pass
            try:
                for proc in pynvml.nvmlDeviceGetComputeRunningProcesses(handle):
                    if int(proc.pid) in pids:
                        used_mb = float(proc.usedGpuMemory) / (1024.0 * 1024.0)
                        if mem_peak_mb is None or used_mb > mem_peak_mb:
                            mem_peak_mb = used_mb
                        if util_peak is None:
                            try:
                                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                                util_peak = float(util.gpu)
                            except Exception:
                                pass
            except Exception:
                continue
    finally:
        try:
            pynvml.nvmlShutdown()
        except Exception:
            pass

    return util_peak, mem_peak_mb


def merge_resource_usage(*parts: dict[str, Any] | None) -> dict[str, Any]:
    """Merge resource_usage dicts; later non-null values win for scalars."""
    out: dict[str, Any] = {
        "duration_ms": None,
        "cpu_time_seconds": None,
        "memory_rss_kb": None,
        "gpu_seconds": None,
        "gpu_memory_mb_seconds": None,
        "disk_read_bytes": None,
        "disk_write_bytes": None,
    }
    for part in parts:
        if not isinstance(part, dict):
            continue
        for key in out:
            val = part.get(key)
            if val is not None:
                out[key] = val
    return out


class ResourceMonitor:
    """Resource Usage Contract v1 — context manager for any Python worker.

    Example::

        with ResourceMonitor() as monitor:
            run_training()
        payload = monitor.complete_bundle()
    """

    def __init__(
        self,
        *,
        task_id: str | None = None,
        pid: int | None = None,
        interval_seconds: float | None = None,
        flush_interval_seconds: float | None = None,
        autostart_pid: bool = True,
    ) -> None:
        self._pid = pid
        self._autostart_pid = autostart_pid
        self._inner = TaskResourceMonitor(
            task_id=task_id,
            interval_seconds=interval_seconds,
            flush_interval_seconds=flush_interval_seconds,
        )
        self._report: dict[str, Any] | None = None

    def __enter__(self) -> ResourceMonitor:
        if self._autostart_pid:
            import os

            self._inner.start(self._pid if self._pid is not None else os.getpid())
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
        if self._inner.root_pid is not None or self._inner._thread is not None:
            self._report = self._inner.stop()
        return False

    def start(self, pid: int) -> None:
        """Start sampling a process tree (same as ``TaskResourceMonitor.start``)."""
        self._inner.start(pid)

    def attach_pid(self, pid: int) -> None:
        self._inner.attach_pid(pid)

    def stop(self) -> dict[str, Any]:
        self._report = self._inner.stop()
        return self._report

    def _report_or_build(self) -> dict[str, Any]:
        if self._report is not None:
            return self._report
        return self._inner.build_report()

    def summary(self) -> dict[str, Any]:
        """Contract v1 peaks + totals for logging or custom complete payloads."""
        from sdk.usage_contract import contract_summary_from_report

        return contract_summary_from_report(self._report_or_build())

    def complete_bundle(self) -> dict[str, Any]:
        """``resource_usage`` + ``usage_samples`` for ``POST .../complete`` or ``.../fail``."""
        from sdk.usage_contract import contract_complete_resource_usage

        report = self._report_or_build()
        return {
            "resource_usage": contract_complete_resource_usage(report),
            "usage_samples": report.get("usage_samples") or [],
        }

    def latest_heartbeat_usage(self) -> dict[str, Any] | None:
        """Latest live sample for ``POST .../heartbeat`` ``usage`` field."""
        from sdk.usage_contract import contract_heartbeat_from_sample

        report = self._report_or_build()
        samples = report.get("usage_samples") or []
        if not samples:
            return None
        last = samples[-1]
        return contract_heartbeat_from_sample(last if isinstance(last, dict) else None)
