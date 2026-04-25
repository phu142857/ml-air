#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{proc.stderr.strip()}")
    return proc.stdout


def _http_ok(url: str, timeout: float = 3.0) -> bool:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            return 200 <= resp.status < 400
    except (urllib.error.URLError, TimeoutError, ValueError, http.client.HTTPException, OSError):
        return False


def _tcp_ok(host: str, port: int, timeout: float = 2.0) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex((host, port)) == 0


def _require_running_services(compose_file: str) -> None:
    out = _run(["docker", "compose", "-f", compose_file, "ps", "--format", "json"])
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    if not lines:
        # Some compose providers return empty output for this format.
        return
    not_running: list[str] = []
    for line in lines:
        item = json.loads(line)
        if item.get("State") != "running":
            not_running.append(f"{item.get('Service')}={item.get('State')}")
    if not_running:
        raise RuntimeError(f"services not running: {', '.join(not_running)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Health check for local quickstart stack.")
    parser.add_argument("--compose-file", default="deploy/docker-compose.quickstart.yml")
    parser.add_argument("--wait-seconds", type=int, default=90)
    args = parser.parse_args()

    _require_running_services(args.compose_file)

    frontend_port = int(os.getenv("ML_AIR_FRONTEND_PORT", "38080"))
    api_port = int(os.getenv("ML_AIR_API_PORT", "8080"))
    scheduler_metrics_port = int(os.getenv("ML_AIR_SCHEDULER_METRICS_PORT", "9102"))
    executor_metrics_port = int(os.getenv("ML_AIR_EXECUTOR_METRICS_PORT", "9103"))
    redis_port = int(os.getenv("ML_AIR_REDIS_PORT", "6379"))
    postgres_port = int(os.getenv("ML_AIR_POSTGRES_PORT", "5432"))
    minio_api_port = int(os.getenv("ML_AIR_MINIO_API_PORT", "9000"))
    minio_console_port = int(os.getenv("ML_AIR_MINIO_CONSOLE_PORT", "9001"))
    prometheus_port = int(os.getenv("ML_AIR_PROMETHEUS_PORT", "39090"))
    grafana_port = int(os.getenv("ML_AIR_GRAFANA_PORT", "33000"))

    checks = [
        ("frontend", lambda: _http_ok(f"http://localhost:{frontend_port}")),
        ("api-health", lambda: _http_ok(f"http://localhost:{api_port}/health")),
        ("scheduler-metrics", lambda: _http_ok(f"http://localhost:{scheduler_metrics_port}/metrics")),
        ("executor-metrics", lambda: _http_ok(f"http://localhost:{executor_metrics_port}/metrics")),
        ("prometheus", lambda: _http_ok(f"http://localhost:{prometheus_port}/-/healthy")),
        ("grafana", lambda: _http_ok(f"http://localhost:{grafana_port}/api/health")),
        ("redis-tcp", lambda: _tcp_ok("127.0.0.1", redis_port)),
        ("postgres-tcp", lambda: _tcp_ok("127.0.0.1", postgres_port)),
        ("minio-api-tcp", lambda: _tcp_ok("127.0.0.1", minio_api_port)),
        ("minio-console", lambda: _http_ok(f"http://localhost:{minio_console_port}")),
    ]

    deadline = time.time() + args.wait_seconds
    pending = {name: fn for name, fn in checks}
    while pending and time.time() < deadline:
        done: list[str] = []
        for name, fn in pending.items():
            if fn():
                done.append(name)
        for name in done:
            pending.pop(name, None)
        if pending:
            time.sleep(2)

    if pending:
        for name in pending:
            print(f"[FAIL] {name}")
        print(f"[FAIL] quickstart health failed ({len(pending)} check(s) still unhealthy)")
        return 1

    print("[PASS] quickstart health checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
