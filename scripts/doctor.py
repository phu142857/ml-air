#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys


REQUIRED_ENV_KEYS = [
    "ML_AIR_REDIS_URL",
    "ML_AIR_DATABASE_URL",
    "ML_AIR_API_BASE_URL",
    "ML_AIR_JWT_HS256_SECRET",
    "ML_AIR_TRACKING_TOKEN",
]


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _total_memory_gib() -> float | None:
    mem_kb = None
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    mem_kb = int(parts[1])
                    break
    except OSError:
        return None
    if mem_kb is None:
        return None
    return mem_kb / 1024 / 1024


def _run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight checks for MLAir quickstart.")
    parser.add_argument("--compose-file", default="deploy/docker-compose.quickstart.yml")
    args = parser.parse_args()

    failed = False

    for command in ("docker", "python"):
        if shutil.which(command) is None:
            print(f"[FAIL] missing command: {command}")
            failed = True
        else:
            print(f"[PASS] command available: {command}")

    rc, _ = _run(["docker", "compose", "version"])
    if rc != 0:
        print("[FAIL] docker compose plugin is not available")
        failed = True
    else:
        print("[PASS] docker compose is available")

    if not os.path.exists(".env"):
        print("[WARN] .env not found; run: cp .env.example .env")
    else:
        print("[PASS] .env file exists")

    env_text = ""
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            env_text = f.read()
    missing_keys = [key for key in REQUIRED_ENV_KEYS if f"{key}=" not in env_text]
    if missing_keys:
        print(f"[WARN] .env missing keys: {', '.join(missing_keys)}")
    else:
        print("[PASS] required .env keys present")

    rc, out = _run(["docker", "compose", "-f", args.compose_file, "config", "-q"])
    if rc != 0:
        print("[FAIL] docker compose config invalid")
        print(out)
        failed = True
    else:
        print("[PASS] docker compose config valid")

    mem_gib = _total_memory_gib()
    if mem_gib is None:
        print("[WARN] cannot detect system memory")
    elif mem_gib < 6:
        print(f"[WARN] low RAM detected ({mem_gib:.2f} GiB); recommend >= 6 GiB")
    else:
        print(f"[PASS] RAM check ({mem_gib:.2f} GiB)")

    ports = [
        int(os.getenv("ML_AIR_FRONTEND_PORT", "38080")),
        int(os.getenv("ML_AIR_API_PORT", "8080")),
        int(os.getenv("ML_AIR_PROMETHEUS_PORT", "39090")),
        int(os.getenv("ML_AIR_GRAFANA_PORT", "33000")),
    ]
    busy = [str(p) for p in ports if _port_open(p)]
    if busy:
        print(f"[WARN] host ports already in use: {', '.join(busy)}")
    else:
        print("[PASS] required host ports are available")

    if failed:
        print("[FAIL] doctor checks failed")
        return 1
    print("[PASS] doctor checks completed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
