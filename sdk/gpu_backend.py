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

    def read_stats(self, pids: set[int]) -> dict[str, Any]:
        from sdk.pid_namespace import expand_pids_for_gpu_match

        if not pids:
            return {}
        try:
            import pynvml
        except ImportError:
            return {}

        match_pids = set(expand_pids_for_gpu_match(frozenset(pids)))

        util_peak: float | None = None
        mem_peak_mb: float | None = None
        power_peak_w: float | None = None
        temp_peak_c: float | None = None

        try:
            pynvml.nvmlInit()
            for idx in range(pynvml.nvmlDeviceGetCount()):
                handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
                dev_util = None
                try:
                    dev_util = float(pynvml.nvmlDeviceGetUtilizationRates(handle).gpu)
                    if util_peak is None or dev_util > util_peak:
                        util_peak = dev_util
                except Exception:
                    pass
                try:
                    power_mw = float(pynvml.nvmlDeviceGetPowerUsage(handle))
                    power_w = power_mw / 1000.0
                    if power_peak_w is None or power_w > power_peak_w:
                        power_peak_w = power_w
                except Exception:
                    pass
                try:
                    temp_c = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
                    if temp_peak_c is None or temp_c > temp_peak_c:
                        temp_peak_c = temp_c
                except Exception:
                    pass
                matched = False
                try:
                    for proc in pynvml.nvmlDeviceGetComputeRunningProcesses(handle):
                        if int(proc.pid) in match_pids and getattr(proc, "usedGpuMemory", None):
                            used_mb = float(proc.usedGpuMemory) / (1024.0 * 1024.0)
                            matched = True
                            if mem_peak_mb is None or used_mb > mem_peak_mb:
                                mem_peak_mb = used_mb
                except Exception:
                    pass
                if not matched and dev_util and dev_util > 0:
                    try:
                        used_mb = float(pynvml.nvmlDeviceGetMemoryInfo(handle).used) / (1024.0 * 1024.0)
                        if mem_peak_mb is None or used_mb > mem_peak_mb:
                            mem_peak_mb = used_mb
                    except Exception:
                        pass
        finally:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass

        out: dict[str, Any] = {}
        if util_peak is not None:
            out["gpu_util_percent"] = util_peak
        if mem_peak_mb is not None:
            out["gpu_memory_mb"] = mem_peak_mb
        if power_peak_w is not None:
            out["gpu_power_w"] = power_peak_w
        if temp_peak_c is not None:
            out["gpu_temp_c"] = temp_peak_c
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
