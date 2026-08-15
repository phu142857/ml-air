"""Helpers for seed scripts: sync demo feature flags into ``.env`` and restart stack."""

from __future__ import annotations

import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]

_DEMO_ENV_FLAGS: dict[str, str] = {
    "ML_AIR_PROJECTIONS_ENABLED": "1",
    "ML_AIR_TIMELINE_PROJECTION_READS": "1",
    "ML_AIR_DASHBOARD_PROJECTION_READS": "1",
    "ML_AIR_NOTIFICATION_DELIVERY": "1",
    "ML_AIR_INTEGRATION_DELIVERY": "1",
    "ML_AIR_EVENT_RETENTION_ENABLED": "1",
    "ML_AIR_SIEM_EXPORT_ENABLED": "1",
    "ML_AIR_EVENT_SCHEMA_REGISTRY_ENABLED": "1",
    "ML_AIR_MULTI_CLUSTER": "1",
    "ML_AIR_MULTI_REGION": "1",
    "ML_AIR_FEDERATION": "1",
    "ML_AIR_EDGE_DEPLOYMENT": "1",
    "ML_AIR_GLOBAL_SCHEDULER": "1",
    "ML_AIR_CROSS_REGION_REPLICATION": "1",
    "ML_AIR_DISASTER_RECOVERY": "1",
    "ML_AIR_GLOBAL_IDENTITY": "1",
    "ML_AIR_GLOBAL_OBSERVABILITY": "1",
    "ML_AIR_EXTENSION_PLATFORM": "1",
    "ML_AIR_ENABLE_SERVING_SLOTS_HTTP": "1",
}

_ENV_LINE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def sync_demo_feature_env(env_path: Path | None = None) -> Path:
    path = env_path or (_REPO / ".env")
    lines: list[str] = []
    seen: set[str] = set()
    if path.is_file():
        lines = path.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    for line in lines:
        m = _ENV_LINE.match(line.strip())
        if m and m.group(1) in _DEMO_ENV_FLAGS:
            key = m.group(1)
            out.append(f"{key}={_DEMO_ENV_FLAGS[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in _DEMO_ENV_FLAGS.items():
        if key not in seen:
            out.append(f"{key}={value}")
    path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    return path


def restart_mlair_service() -> int:
    compose = os.getenv("MLAIR_COMPOSE_FILE", "deploy/docker-compose.allinone.yml")
    compose_path = _REPO / compose
    if not compose_path.is_file():
        print(f"[WARN] compose file not found: {compose_path}", file=sys.stderr)
        return 1
    cmd = ["docker", "compose", "-f", str(compose_path)]
    env_file = _REPO / ".env"
    if env_file.is_file():
        cmd.extend(["--env-file", str(env_file)])
    cmd.extend(["restart", "api"])
    print("[INFO] restarting api service to apply feature env flags")
    proc = subprocess.run(cmd, cwd=str(_REPO), check=False)
    return int(proc.returncode)


def wait_for_health(base_url: str, *, timeout_sec: int = 120) -> bool:
    base = base_url.rstrip("/")
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"{base}/health", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(2)
    return False
