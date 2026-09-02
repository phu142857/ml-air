"""Sample resource usage for an external workload container (e.g. vet-ai-local)."""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

from sdk.podman_client import fetch_container_stats, parse_stats_sample, workload_container_name
from sdk.resource_monitor import default_flush_interval_seconds, default_sample_interval_seconds

logger = logging.getLogger("mlair.workload_container_monitor")


def workload_container_monitor_enabled() -> bool:
    if os.getenv("ML_AIR_WORKLOAD_CONTAINER_MONITOR_ENABLED", "1").strip().lower() in ("0", "false", "no"):
        return False
    return workload_container_name() is not None


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkloadContainerMonitor:
    """Background sampler for a named Podman workload container."""

    def __init__(
        self,
        *,
        task_id: str | None = None,
        container_name: str | None = None,
        interval_seconds: float | None = None,
        flush_interval_seconds: float | None = None,
    ) -> None:
        self.task_id = str(task_id or "").strip() or None
        self.container_name = (container_name or workload_container_name() or "").strip()
        self.interval_seconds = interval_seconds if interval_seconds is not None else default_sample_interval_seconds()
        self.flush_interval_seconds = (
            flush_interval_seconds if flush_interval_seconds is not None else default_flush_interval_seconds()
        )
        self._samples: list[dict[str, Any]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._started_at: float | None = None
        self._cpu_time_seconds = 0.0
        self._last_total_usage_ns: int | None = None
        self._last_sample_at: float | None = None
        self._last_flush_at = 0.0
        self._lock = threading.Lock()

    def start(self) -> None:
        if not self.container_name:
            logger.warning("workload_container_monitor_missing_name")
            return
        if self._thread and self._thread.is_alive():
            return
        self._started_at = time.perf_counter()
        self._stop.clear()
        self._thread = threading.Thread(target=self._sample_loop, name="mlair-workload-monitor", daemon=True)
        self._thread.start()

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

        memory_rss_kb = None
        if samples:
            peak_mb = max(float(s["memory_mb"]) for s in samples if s.get("memory_mb") is not None)
            memory_rss_kb = int(peak_mb * 1024)

        resource_usage: dict[str, Any] = {
            "duration_ms": int(wall_seconds * 1000) if wall_seconds > 0 else None,
            "cpu_time_seconds": self._cpu_time_seconds if self._cpu_time_seconds > 0 else None,
            "memory_rss_kb": memory_rss_kb,
            "gpu_seconds": None,
            "gpu_memory_mb_seconds": None,
            "disk_read_bytes": None,
            "disk_write_bytes": None,
            "network_rx_bytes": None,
            "network_tx_bytes": None,
        }

        return {
            "resource_usage": resource_usage,
            "usage_samples": samples,
            "resource_monitor": {
                "workload_container": self.container_name,
                "sample_count": len(samples),
                "sample_interval_seconds": self.interval_seconds,
                "source": "workload_container",
            },
        }

    def _sample_loop(self) -> None:
        next_sample_at = time.monotonic()
        flush_tick = max(0.05, min(self.interval_seconds, self.flush_interval_seconds or self.interval_seconds))
        last_sample: dict[str, Any] | None = None
        while not self._stop.is_set():
            now = time.monotonic()
            if now >= next_sample_at:
                sample = self._sample_once(now)
                if sample:
                    with self._lock:
                        self._samples.append(sample)
                    last_sample = sample
                next_sample_at = now + self.interval_seconds

            if last_sample is not None:
                self._maybe_flush_sample(last_sample)

            sleep_for = min(flush_tick, max(0.05, next_sample_at - time.monotonic()))
            if self._stop.wait(sleep_for):
                break

    def _sample_once(self, now: float) -> dict[str, Any] | None:
        stats = fetch_container_stats(self.container_name)
        if not stats:
            return None
        sample, total_usage = parse_stats_sample(
            stats,
            prev_total_usage_ns=self._last_total_usage_ns,
            prev_at=self._last_sample_at,
            sampled_at=now,
        )
        if self._last_total_usage_ns is not None and total_usage >= self._last_total_usage_ns:
            self._cpu_time_seconds += (total_usage - self._last_total_usage_ns) / 1e9
        self._last_total_usage_ns = total_usage
        self._last_sample_at = now
        sample["sampled_at"] = _iso_now()
        return sample

    def _maybe_flush_sample(self, sample: dict[str, Any]) -> None:
        if not self.task_id or self.flush_interval_seconds <= 0:
            return
        now = time.monotonic()
        if now - self._last_flush_at < self.flush_interval_seconds:
            return
        self._last_flush_at = now
        flush_sample = {**sample, "sampled_at": _iso_now()}
        try:
            from sdk.usage_cost import persist_usage_samples, usage_tracking_enabled

            if usage_tracking_enabled():
                persist_usage_samples(task_id=self.task_id, samples=[flush_sample])
        except Exception:
            logger.exception("workload_container_flush_failed task_id=%s", self.task_id)
