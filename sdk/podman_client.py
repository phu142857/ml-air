"""Minimal Podman libpod client for container stats (unix socket)."""

from __future__ import annotations

import http.client
import json
import logging
import os
import socket
from typing import Any

logger = logging.getLogger("mlair.podman_client")

_API_VERSIONS = ("v5.0.0", "v4.9.0", "v4.8.0", "v4.0.0")


def podman_socket_path() -> str:
    return os.getenv("ML_AIR_PODMAN_SOCKET", "/run/podman/podman.sock").strip() or "/run/podman/podman.sock"


def workload_container_name() -> str | None:
    name = os.getenv("ML_AIR_WORKLOAD_CONTAINER_NAME", "").strip()
    return name or None


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_path: str) -> None:
        super().__init__("localhost")
        self._unix_path = unix_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self._unix_path)


def fetch_container_stats(container_name: str, *, socket_path: str | None = None) -> dict[str, Any] | None:
    """Return libpod stats JSON for ``container_name``, or None when unavailable."""
    sock = socket_path or podman_socket_path()
    if not sock or not os.path.exists(sock):
        return None
    for version in _API_VERSIONS:
        conn = _UnixHTTPConnection(sock)
        try:
            path = f"/{version}/libpod/containers/{container_name}/stats?stream=false"
            conn.request("GET", path)
            resp = conn.getresponse()
            body = resp.read()
            if resp.status == 404:
                continue
            if resp.status != 200:
                logger.debug("podman_stats_http status=%s version=%s container=%s", resp.status, version, container_name)
                continue
            parsed = json.loads(body.decode("utf-8"))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            logger.debug("podman_stats_failed version=%s container=%s", version, container_name, exc_info=True)
        finally:
            conn.close()
    return None


def parse_stats_sample(
    stats: dict[str, Any],
    *,
    prev_total_usage_ns: int | None,
    prev_at: float | None,
    sampled_at: float,
) -> tuple[dict[str, Any], int | None]:
    """Derive a usage sample + latest cumulative CPU usage (nanoseconds)."""
    cpu_stats = stats.get("cpu_stats") if isinstance(stats.get("cpu_stats"), dict) else {}
    cpu_usage = cpu_stats.get("cpu_usage") if isinstance(cpu_stats.get("cpu_usage"), dict) else {}
    mem_stats = stats.get("memory_stats") if isinstance(stats.get("memory_stats"), dict) else {}
    total_usage = int(cpu_usage.get("total_usage") or 0)
    online_cpus = int(cpu_stats.get("online_cpus") or 1)
    mem_bytes = int(mem_stats.get("usage") or 0)
    memory_mb = mem_bytes / (1024 * 1024) if mem_bytes > 0 else None

    cpu_percent = 0.0
    if prev_total_usage_ns is not None and prev_at is not None:
        wall = max(0.001, sampled_at - prev_at)
        cpu_sec = max(0.0, (total_usage - prev_total_usage_ns) / 1e9)
        cores_used = cpu_sec / wall
        # Match podman-style display: percent of one CPU core (0–100), not machine-wide.
        cpu_percent = min(100.0, cores_used * 100.0)
    elif cpu_stats.get("cpu") is not None:
        try:
            raw = float(cpu_stats["cpu"])
            from sdk.usage_cost_math import normalize_cpu_tree_percent

            cpu_percent = float(normalize_cpu_tree_percent(raw, logical_cpus=online_cpus) or 0.0)
        except (TypeError, ValueError):
            cpu_percent = 0.0

    sample: dict[str, Any] = {
        "cpu_percent": round(cpu_percent, 2),
        "memory_mb": round(memory_mb, 2) if memory_mb is not None else None,
        "workload_container": stats.get("name") or stats.get("id"),
    }
    return sample, total_usage
