"""``mlair health`` — verify running stack."""

from __future__ import annotations

import os
import subprocess
import sys

from mlair.config.loader import apply_to_environ, load_config
from mlair.paths import repo_root


def run_health(
    *,
    profile: str | None = None,
    config_path: str | None = None,
    wait_seconds: int = 90,
) -> int:
    root = repo_root()
    os.chdir(root)
    cfg = load_config(config_path, profile=profile or os.getenv("MLAIR_PROFILE"))
    apply_to_environ(cfg)

    compose_rel = (cfg.get("compose") or {}).get("file", "deploy/docker-compose.quickstart.yml")
    compose_file = str(root / compose_rel)
    script = root / "scripts" / "check_quickstart_health.py"
    if not script.is_file():
        print("[mlair] health script missing; use curl http://localhost:8080/health", file=sys.stderr)
        return 1

    cmd = [
        sys.executable,
        str(script),
        "--compose-file",
        compose_file,
        "--wait-seconds",
        str(wait_seconds),
    ]
    return subprocess.run(cmd, check=False).returncode
