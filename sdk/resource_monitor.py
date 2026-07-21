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
        # CPU% is derived from the delta of cumulative tree cpu_times between
        # samples (robust to process churn / PID reuse, unlike per-process
        # cpu_percent() which needs a stable object + baseline and silently
        # reports 0 when the tree changes each sample).
        self._last_cpu_total: float | None = None
        self._last_cpu_ts: float | None = None
        self._net_io0: tuple[int, int] | None = None
        self._gpu_backend = None
        try:
            from sdk.gpu_backend import detect_gpu_backend

            self._gpu_backend = detect_gpu_backend()
        except Exception:
            self._gpu_backend = None

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
        self._net_io0 = _net_io_counters()
        # Prime CPU delta baseline; first sample measures from here.
        self._last_cpu_total = self._cpu_times0
        self._last_cpu_ts = time.monotonic()

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
        network_rx = None
        network_tx = None
        if self._root_pid is not None and psutil is not None:
            cpu_end = self._cpu_time_seconds_tree(self._root_pid)
            cpu_seconds = max(0.0, cpu_end - self._cpu_times0)
            disk_end = self._disk_io_tree(self._root_pid)
            if self._disk_io0 is not None and disk_end is not None:
                disk_read = max(0, disk_end[0] - self._disk_io0[0])
                disk_write = max(0, disk_end[1] - self._disk_io0[1])
            net_end = _net_io_counters()
            if self._net_io0 is not None and net_end is not None:
                network_rx = max(0, net_end[0] - self._net_io0[0])
                network_tx = max(0, net_end[1] - self._net_io0[1])

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
            "network_rx_bytes": network_rx,
            "network_tx_bytes": network_tx,
        }

        try:
            from sdk.resource_events import collect_resource_events

            events = collect_resource_events(root_pid=self._root_pid)
        except Exception:
            events = []

        return {
            "resource_usage": resource_usage,
            "usage_samples": samples,
            "resource_events": events,
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
                batch = self._sample_once()
                if batch:
                    with self._lock:
                        for sample in batch:
                            self._samples.append(sample)
                        peak_gpu = max(
                            (float(s["gpu_util_percent"]) for s in batch if s.get("gpu_util_percent") is not None),
                            default=None,
                        )
                        if peak_gpu is not None and peak_gpu > 0:
                            self._gpu_seconds_acc += self.interval_seconds
                        peak_mem = max(
                            (float(s["gpu_memory_mb"]) for s in batch if s.get("gpu_memory_mb") is not None),
                            default=None,
                        )
                        if peak_mem is not None:
                            self._gpu_mem_mb_seconds_acc += peak_mem * self.interval_seconds
                    last_sample = batch[-1]
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

    def _sample_once(self) -> list[dict[str, Any]]:
        if self._root_pid is None or psutil is None:
            return []
        procs = self._process_tree(self._root_pid)
        if not procs:
            return []

        mem_bytes = 0
        pids: set[int] = set()
        cpu_total = 0.0
        for proc in procs:
            pids.add(proc.pid)
            mem_bytes += self._proc_mem_bytes(proc)
            try:
                ct = proc.cpu_times()
                cpu_total += float(ct.user + ct.system)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        # CPU% from cumulative cpu_times delta over wall time (sum-of-cores scale;
        # e.g. 350 on an 8-core box). normalize_cpu_tree_percent divides by the
        # logical CPU count to yield 0–100 machine utilization.
        now = time.monotonic()
        cpu_pct = 0.0
        if self._last_cpu_total is not None and self._last_cpu_ts is not None:
            dt = now - self._last_cpu_ts
            if dt > 0:
                cpu_pct = max(0.0, (cpu_total - self._last_cpu_total) / dt * 100.0)
        self._last_cpu_total = cpu_total
        self._last_cpu_ts = now

        gpu_util, gpu_mem_mb, gpu_power_w, gpu_temp_c = None, None, None, None
        device_rows: list[dict[str, Any]] = []
        if self._gpu_backend is not None:
            device_rows = self._gpu_backend.read_devices_stats(pids)
            if device_rows:
                gpu_util = max(
                    (float(d["gpu_util_percent"]) for d in device_rows if d.get("gpu_util_percent") is not None),
                    default=None,
                )
                gpu_mem_mb = max(
                    (float(d["gpu_memory_mb"]) for d in device_rows if d.get("gpu_memory_mb") is not None),
                    default=None,
                )
                gpu_power_w = max(
                    (float(d["gpu_power_w"]) for d in device_rows if d.get("gpu_power_w") is not None),
                    default=None,
                )
                gpu_temp_c = max(
                    (float(d["gpu_temp_c"]) for d in device_rows if d.get("gpu_temp_c") is not None),
                    default=None,
                )

        from sdk.usage_cost_math import normalize_cpu_tree_percent

        cpu_pct = normalize_cpu_tree_percent(cpu_pct) or 0.0

        net_rx, net_tx = None, None
        net_end = _net_io_counters()
        if self._net_io0 is not None and net_end is not None:
            net_rx = max(0, net_end[0] - self._net_io0[0])
            net_tx = max(0, net_end[1] - self._net_io0[1])

        base: dict[str, Any] = {
            "sampled_at": _iso_now(),
            "cpu_percent": cpu_pct,
            "memory_mb": mem_bytes / (1024.0 * 1024.0) if mem_bytes > 0 else 0.0,
        }
        if net_rx is not None:
            base["network_rx_bytes"] = net_rx
        if net_tx is not None:
            base["network_tx_bytes"] = net_tx

        if device_rows:
            out: list[dict[str, Any]] = []
            for dev in device_rows:
                row = {**base}
                for key in ("device_id", "gpu_util_percent", "gpu_memory_mb", "gpu_power_w", "gpu_temp_c"):
                    if dev.get(key) is not None:
                        row[key] = dev[key]
                out.append(row)
            return out

        sample: dict[str, Any] = {
            **base,
            "gpu_util_percent": gpu_util,
            "gpu_memory_mb": gpu_mem_mb,
        }
        if gpu_power_w is not None:
            sample["gpu_power_w"] = gpu_power_w
        if gpu_temp_c is not None:
            sample["gpu_temp_c"] = gpu_temp_c
        if gpu_util is not None or gpu_mem_mb is not None:
            sample["device_id"] = 0
        return [sample]

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

    @staticmethod
    def _proc_mem_bytes(proc: Any) -> int:
        """Memory footprint of one process, preferring PSS/USS over RSS.

        Summing RSS across a process tree double-counts pages shared between
        parent/children (shared libs, CUDA context, forked dataloader workers),
        which inflates the total to tens of GB. PSS apportions shared pages so
        the tree sum reflects the real footprint; USS is the next best; RSS is
        the last-resort fallback where smaps is unreadable.
        """
        if psutil is None:
            return 0
        try:
            full = proc.memory_full_info()
            pss = int(getattr(full, "pss", 0) or 0)
            if pss > 0:
                return pss
            uss = int(getattr(full, "uss", 0) or 0)
            if uss > 0:
                return uss
        except Exception:
            pass
        try:
            return int(proc.memory_info().rss)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return 0

    def _memory_rss_bytes_tree(self, root_pid: int) -> int:
        total = 0
        for proc in self._process_tree(root_pid):
            total += self._proc_mem_bytes(proc)
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


def _net_io_counters() -> tuple[int, int] | None:
    """Container/host network bytes (best-effort when per-process stats unavailable)."""
    if psutil is None:
        return None
    try:
        counters = psutil.net_io_counters()
        return int(counters.bytes_recv), int(counters.bytes_sent)
    except Exception:
        return None


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
        "network_rx_bytes": None,
        "network_tx_bytes": None,
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
        bundle: dict[str, Any] = {
            "resource_usage": contract_complete_resource_usage(report),
            "usage_samples": report.get("usage_samples") or [],
        }
        events = report.get("resource_events")
        if events:
            bundle["resource_events"] = events
        return bundle

    def latest_heartbeat_usage(self) -> dict[str, Any] | None:
        """Latest live sample for ``POST .../heartbeat`` ``usage`` field."""
        from sdk.usage_contract import contract_heartbeat_from_sample

        report = self._report_or_build()
        samples = report.get("usage_samples") or []
        if not samples:
            return None
        last = samples[-1]
        return contract_heartbeat_from_sample(last if isinstance(last, dict) else None)
