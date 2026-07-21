"""Detect OOM, CPU throttle, and related resource failure signals."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def _read_int(path: Path) -> int | None:
    try:
        return int(path.read_text(encoding="utf-8").strip().split()[0])
    except (OSError, ValueError, IndexError):
        return None


def _cgroup_event_count(name: str) -> int | None:
    for base in (Path("/sys/fs/cgroup"), Path(f"/proc/{os.getpid()}/root/sys/fs/cgroup")):
        for path in (base / "memory.events", base / "memory" / "memory.events"):
            if not path.is_file():
                continue
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    key, _, val = line.partition(" ")
                    if key.strip() == name:
                        return int(val.strip())
            except (OSError, ValueError):
                continue
    return None


def _cpu_throttled_usec() -> int | None:
    for base in (Path("/sys/fs/cgroup"), Path(f"/proc/{os.getpid()}/root/sys/fs/cgroup")):
        for path in (base / "cpu.stat", base / "cpu" / "cpu.stat"):
            if not path.is_file():
                continue
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    key, _, val = line.partition(" ")
                    if key.strip() in {"nr_throttled", "throttled_usec", "nr_periods_throttled"}:
                        return int(val.strip())
            except (OSError, ValueError):
                continue
    return None


def collect_resource_events(*, root_pid: int | None = None) -> list[dict[str, Any]]:
    """Best-effort snapshot of resource failure/throttle signals."""
    events: list[dict[str, Any]] = []

    oom = _cgroup_event_count("oom_kill")
    if oom and oom > 0:
        events.append({"type": "oom_kill", "count": oom, "source": "cgroup"})

    throttle = _cpu_throttled_usec()
    if throttle and throttle > 0:
        events.append({"type": "cpu_throttled", "value": throttle, "source": "cgroup"})

    if root_pid is not None and root_pid > 0:
        try:
            status = Path(f"/proc/{root_pid}/status").read_text(encoding="utf-8")
        except OSError:
            status = ""
        for line in status.splitlines():
            if line.startswith("State:") and "Z" in line:
                events.append({"type": "process_zombie", "pid": root_pid, "source": "proc"})
                break

    return events
