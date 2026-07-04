"""Map container PIDs to host PIDs via ``NSpid`` in ``/proc/<pid>/status``."""

from __future__ import annotations

from functools import lru_cache


def host_pid_for(container_pid: int) -> int | None:
    """Return the host PID for ``container_pid`` when PID namespaces differ."""
    pid = int(container_pid)
    if pid <= 0:
        return None
    try:
        text = open(f"/proc/{pid}/status", encoding="utf-8").read()
    except OSError:
        return None
    for line in text.splitlines():
        if not line.startswith("NSpid:"):
            continue
        parts = [p for p in line.split()[1:] if p.isdigit()]
        if len(parts) >= 2:
            return int(parts[-1])
        if parts:
            return int(parts[0])
    return pid


@lru_cache(maxsize=4096)
def expand_pids_for_gpu_match(pids: frozenset[int]) -> frozenset[int]:
    """Container PID set plus host PID aliases for NVML matching."""
    out: set[int] = set(pids)
    for pid in pids:
        host = host_pid_for(pid)
        if host is not None:
            out.add(host)
    return frozenset(out)
