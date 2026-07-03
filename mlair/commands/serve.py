"""MLAir runtime commands — separate ``build`` / ``start`` / ``stop`` / ``rebuild`` via Docker Compose."""

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


def _prepare(
    profile: str | None,
    config_path: str | None,
    *,
    ensure_env: bool = False,
) -> tuple[Path, dict] | None:
    """Shared setup: chdir to repo root, load config, resolve compose file."""
    root = repo_root()
    if not root.is_dir():
        print("[mlair] cannot locate repository root", file=sys.stderr)
        return None

    os.chdir(root)
    cfg = load_config(config_path, profile=profile or os.getenv("MLAIR_PROFILE"))
    apply_to_environ(cfg)
    if ensure_env:
        _ensure_env_file()

    compose_path = _compose_file(cfg)
    if not compose_path.is_file():
        print(f"[mlair] compose file not found: {compose_path}", file=sys.stderr)
        return None
    return compose_path, cfg


def _compose(compose_path: Path, *args: str) -> int:
    proc = subprocess.run(["docker", "compose", "-f", str(compose_path), *args], check=False)
    return proc.returncode


def _print_endpoints(cfg: dict) -> None:
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
    print("  Health:   mlair health")
    print("  Docs:     docs/configuration.md")


def run_build(*, no_cache: bool = False, profile: str | None = None, config_path: str | None = None) -> int:
    """Build images only (no start)."""
    prep = _prepare(profile, config_path, ensure_env=True)
    if prep is None:
        return 1
    compose_path, cfg = prep
    print(f"[mlair] build profile={cfg.get('profile')} compose={compose_path}")
    args = ["build"]
    if no_cache:
        args.append("--no-cache")
    return _compose(compose_path, *args)


def run_start(*, detach: bool = True, profile: str | None = None, config_path: str | None = None) -> int:
    """Start the stack from existing images (no build)."""
    prep = _prepare(profile, config_path, ensure_env=True)
    if prep is None:
        return 1
    compose_path, cfg = prep
    print(f"[mlair] start profile={cfg.get('profile')} compose={compose_path}")
    args = ["up"]
    if detach:
        args.append("-d")
    rc = _compose(compose_path, *args)
    if rc != 0:
        return rc
    _print_endpoints(cfg)
    return 0


def run_rebuild(
    *,
    no_cache: bool = False,
    detach: bool = True,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    """Rebuild images then (re)start."""
    prep = _prepare(profile, config_path, ensure_env=True)
    if prep is None:
        return 1
    compose_path, cfg = prep
    print(f"[mlair] rebuild profile={cfg.get('profile')} compose={compose_path}")
    build_args = ["build"]
    if no_cache:
        build_args.append("--no-cache")
    rc = _compose(compose_path, *build_args)
    if rc != 0:
        return rc
    args = ["up"]
    if detach:
        args.append("-d")
    rc = _compose(compose_path, *args)
    if rc != 0:
        return rc
    _print_endpoints(cfg)
    return 0


def run_stop(*, profile: str | None = None, config_path: str | None = None) -> int:
    """Stop and remove the stack containers."""
    prep = _prepare(profile, config_path)
    if prep is None:
        return 1
    compose_path, _cfg = prep
    return _compose(compose_path, "down")


def run_serve(
    *,
    build: bool = False,
    detach: bool = True,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    """Deprecated alias: ``serve`` == ``start``; ``serve --build`` == ``rebuild`` (cache reused)."""
    if build:
        print(
            "[mlair] note: `serve --build` is deprecated — use `mlair build` / `mlair rebuild`",
            file=sys.stderr,
        )
        return run_rebuild(no_cache=False, detach=detach, profile=profile, config_path=config_path)
    return run_start(detach=detach, profile=profile, config_path=config_path)
