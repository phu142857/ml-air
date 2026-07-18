"""``mlair doctor`` — preflight before starting the stack."""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

from mlair.compose_cli import compose_argv
from mlair.config.loader import apply_to_environ, infra_enabled, load_config
from mlair.env import load_project_env
from mlair.paths import repo_root


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _total_memory_gib() -> float | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) / 1024 / 1024
    except OSError:
        return None
    return None


def _run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def run_doctor(
    *,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    root = repo_root()
    os.chdir(root)
    load_project_env()
    cfg = load_config(config_path, profile=profile or os.getenv("MLAIR_PROFILE"))
    apply_to_environ(cfg)

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

    env_path = root / ".env"
    if not env_path.is_file():
        example = root / ".env.example"
        if example.is_file():
            print("[WARN] .env not found; `mlair start` will merge .env.example + deploy/.env.infra.example")
        else:
            print("[WARN] .env not found")
    else:
        print("[PASS] .env file exists")

    compose_rel = (cfg.get("compose") or {}).get("file", "deploy/docker-compose.quickstart.yml")
    compose_file = root / compose_rel
    rc, out = _run(compose_argv(compose_file, "config", "-q"))
    if rc != 0:
        print("[FAIL] docker compose config invalid")
        print(out)
        failed = True
    else:
        print("[PASS] docker compose config valid")

    mem = _total_memory_gib()
    if mem is None:
        print("[WARN] cannot detect system memory")
    elif mem < 6:
        print(f"[WARN] low RAM ({mem:.2f} GiB); recommend >= 6 GiB")
    else:
        print(f"[PASS] RAM check ({mem:.2f} GiB)")

    compose_rel = (cfg.get("compose") or {}).get("file", "deploy/docker-compose.quickstart.yml")
    is_allinone = "allinone" in str(compose_rel)

    if is_allinone:
        ports = [int(os.getenv("MLAIR_PORT", "8080"))]
        infra = infra_enabled(cfg)
        if infra.get("prometheus"):
            ports.append(int(os.getenv("ML_AIR_PROMETHEUS_PORT", "39090")))
        if infra.get("grafana"):
            ports.append(int(os.getenv("ML_AIR_GRAFANA_PORT", "33000")))
        if infra.get("minio"):
            ports.append(int(os.getenv("ML_AIR_MINIO_API_PORT", "9000")))
            ports.append(int(os.getenv("ML_AIR_MINIO_CONSOLE_PORT", "9001")))
    else:
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

    print(f"[INFO] active profile: {cfg.get('profile')}")
    if failed:
        print("[FAIL] doctor checks failed")
        return 1
    print("[PASS] doctor checks completed")
    return 0
