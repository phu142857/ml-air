"""Per-process GPU profiling backends (Phase 4 — optional, heavy).

CUPTI and DCGM provide accurate per-job GPU utilization but require host
libraries and elevated privileges. Not enabled by default.
"""

from __future__ import annotations

from typing import Any


class GPUProfilingBackend:
    name: str = "none"

    @classmethod
    def available(cls) -> bool:
        return False

    def read_process_util(self, pids: set[int]) -> dict[str, Any]:
        return {}


class DCGMProfilingBackend(GPUProfilingBackend):
    name = "nvidia-dcgm"

    @classmethod
    def available(cls) -> bool:
        return False


class CUPTIProfilingBackend(GPUProfilingBackend):
    name = "nvidia-cupti"

    @classmethod
    def available(cls) -> bool:
        return False
