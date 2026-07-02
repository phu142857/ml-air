"""``mlair serve`` — start microservice stack via Docker Compose."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from mlair.config.loader import apply_to_environ, load_config
from mlair.paths import default_compose_file, default_env_example, repo_root


def _ensure_env_file() -> None:
    env_path = repo_root() / ".env"
    example = default_env_example()
    if env_path.is_file() or not example.is_file():
        return
    env_path.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"[mlair] created {env_path} from .env.example")


def _compose_file(cfg: dict) -> Path:
    compose = cfg.get("compose") if isinstance(cfg.get("compose"), dict) else {}
    rel = str(compose.get("file") or os.getenv("MLAIR_COMPOSE_FILE") or "").strip()
    if rel:
        path = (repo_root() / rel).resolve()
        if path.is_file():
            return path
    return default_compose_file()


def run_serve(
    *,
    build: bool = False,
    detach: bool = True,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    root = repo_root()
    if not root.is_dir():
        print("[mlair] cannot locate repository root", file=sys.stderr)
        return 1

    os.chdir(root)
    cfg = load_config(config_path, profile=profile or os.getenv("MLAIR_PROFILE"))
    apply_to_environ(cfg)
    _ensure_env_file()

    compose_path = _compose_file(cfg)
    if not compose_path.is_file():
        print(f"[mlair] compose file not found: {compose_path}", file=sys.stderr)
        return 1

    cmd = ["docker", "compose", "-f", str(compose_path), "up"]
    if detach:
        cmd.append("-d")
    if build:
        cmd.append("--build")

    print(f"[mlair] profile={cfg.get('profile')} compose={compose_path}")
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        return proc.returncode

    compose_rel = str((cfg.get("compose") or {}).get("file") or "")
    is_allinone = "allinone" in compose_rel
    if is_allinone:
        hub_port = os.getenv("MLAIR_PORT", "8080")
        print("[mlair] single-container stack starting")
        print(f"  MLAir:    http://localhost:{hub_port}")
    else:
        api_port = os.getenv("ML_AIR_API_PORT", "8080")
        ui_port = os.getenv("ML_AIR_FRONTEND_PORT", "38080")
        print("[mlair] microservices stack starting")
        print(f"  API:      http://localhost:{api_port}")
        print(f"  Hub:      http://localhost:{ui_port}")
        print(f"  Realtime: ws://localhost:{os.getenv('MLAIR_REALTIME_PORT', '8001')}")
    print(f"  Health:   mlair health")
    print(f"  Docs:     docs/configuration.md")
    return 0


def run_stop(
    *,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    root = repo_root()
    os.chdir(root)
    cfg = load_config(config_path, profile=profile or os.getenv("MLAIR_PROFILE"))
    apply_to_environ(cfg)
    compose_path = _compose_file(cfg)
    proc = subprocess.run(["docker", "compose", "-f", str(compose_path), "down"], check=False)
    return proc.returncode
