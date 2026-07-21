"""GPU stats backends — NVML today; AMD/Intel/Apple stubs for future."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class GPUBackend(ABC):
    name: str = "base"

    @classmethod
    @abstractmethod
    def available(cls) -> bool:
        raise NotImplementedError

    @abstractmethod
    def read_stats(self, pids: set[int]) -> dict[str, Any]:
        """Return util/memory/power/temp peaks for monitored PIDs."""
        raise NotImplementedError

    def read_devices_stats(self, pids: set[int]) -> list[dict[str, Any]]:
        """Per-GPU rows with ``device_id`` (0..N-1). Default: single aggregate row."""
        agg = self.read_stats(pids)
        if not agg:
            return []
        return [{"device_id": 0, **agg}]


class NVIDIABackend(GPUBackend):
    name = "nvidia-nvml"

    @classmethod
    def available(cls) -> bool:
        try:
            import pynvml  # noqa: F401

            pynvml.nvmlInit()
            pynvml.nvmlShutdown()
            return True
        except Exception:
            return False

    def read_devices_stats(self, pids: set[int]) -> list[dict[str, Any]]:
        from sdk.pid_namespace import expand_pids_for_gpu_match

        if not pids:
            return []
        try:
            import pynvml
        except ImportError:
            return []

        match_pids = set(expand_pids_for_gpu_match(frozenset(pids)))
        devices: list[dict[str, Any]] = []

        try:
            pynvml.nvmlInit()
            for idx in range(pynvml.nvmlDeviceGetCount()):
                handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
                dev_util: float | None = None
                mem_mb: float | None = None
                power_w: float | None = None
                temp_c: float | None = None
                try:
                    dev_util = float(pynvml.nvmlDeviceGetUtilizationRates(handle).gpu)
                except Exception:
                    pass
                try:
                    power_w = float(pynvml.nvmlDeviceGetPowerUsage(handle)) / 1000.0
                except Exception:
                    pass
                try:
                    temp_c = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
                except Exception:
                    pass
                matched = False
                try:
                    for proc in pynvml.nvmlDeviceGetComputeRunningProcesses(handle):
                        if int(proc.pid) in match_pids and getattr(proc, "usedGpuMemory", None):
                            used_mb = float(proc.usedGpuMemory) / (1024.0 * 1024.0)
                            matched = True
                            if mem_mb is None or used_mb > mem_mb:
                                mem_mb = used_mb
                except Exception:
                    pass
                if not matched and dev_util and dev_util > 0:
                    try:
                        mem_mb = float(pynvml.nvmlDeviceGetMemoryInfo(handle).used) / (1024.0 * 1024.0)
                    except Exception:
                        pass
                if dev_util is None and mem_mb is None and power_w is None and temp_c is None:
                    continue
                row: dict[str, Any] = {"device_id": int(idx)}
                if dev_util is not None:
                    row["gpu_util_percent"] = dev_util
                if mem_mb is not None:
                    row["gpu_memory_mb"] = mem_mb
                if power_w is not None:
                    row["gpu_power_w"] = power_w
                if temp_c is not None:
                    row["gpu_temp_c"] = temp_c
                devices.append(row)
        finally:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
        return devices

    def read_stats(self, pids: set[int]) -> dict[str, Any]:
        devices = self.read_devices_stats(pids)
        if not devices:
            return {}
        util_peak = mem_peak = power_peak = temp_peak = None
        for dev in devices:
            u = dev.get("gpu_util_percent")
            if u is not None and (util_peak is None or float(u) > util_peak):
                util_peak = float(u)
            m = dev.get("gpu_memory_mb")
            if m is not None and (mem_peak is None or float(m) > mem_peak):
                mem_peak = float(m)
            p = dev.get("gpu_power_w")
            if p is not None and (power_peak is None or float(p) > power_peak):
                power_peak = float(p)
            t = dev.get("gpu_temp_c")
            if t is not None and (temp_peak is None or float(t) > temp_peak):
                temp_peak = float(t)
        out: dict[str, Any] = {}
        if util_peak is not None:
            out["gpu_util_percent"] = util_peak
        if mem_peak is not None:
            out["gpu_memory_mb"] = mem_peak
        if power_peak is not None:
            out["gpu_power_w"] = power_peak
        if temp_peak is not None:
            out["gpu_temp_c"] = temp_peak
        return out


class AMDBackend(GPUBackend):
    name = "amd-rocm"

    @classmethod
    def available(cls) -> bool:
        return False

    def read_stats(self, pids: set[int]) -> dict[str, Any]:
        return {}


class IntelBackend(GPUBackend):
    name = "intel"

    @classmethod
    def available(cls) -> bool:
        return False

    def read_stats(self, pids: set[int]) -> dict[str, Any]:
        return {}


class AppleBackend(GPUBackend):
    name = "apple-metal"

    @classmethod
    def available(cls) -> bool:
        return False

    def read_stats(self, pids: set[int]) -> dict[str, Any]:
        return {}


_BACKENDS: tuple[type[GPUBackend], ...] = (
    NVIDIABackend,
    AMDBackend,
    IntelBackend,
    AppleBackend,
)


def detect_gpu_backend() -> GPUBackend | None:
    for cls in _BACKENDS:
        if cls.available():
            return cls()
    return None
