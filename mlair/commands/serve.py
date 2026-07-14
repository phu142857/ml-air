"""MLAir runtime commands — separate ``build`` / ``start`` / ``stop`` / ``rebuild`` via Docker Compose."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from mlair.config.loader import apply_to_environ, infra_enabled, load_config
from mlair.paths import default_compose_file, default_env_example, default_env_infra_example, repo_root


def _ensure_env_file() -> None:
    env_path = repo_root() / ".env"
    if env_path.is_file():
        return
    parts: list[str] = []
    for example in (default_env_example(), default_env_infra_example()):
        if example.is_file():
            parts.append(example.read_text(encoding="utf-8").rstrip())
    if not parts:
        return
    env_path.write_text("\n\n".join(parts) + "\n", encoding="utf-8")
    print("[mlair] created .env from .env.example + deploy/.env.infra.example")


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


def _build_sdk_wheel(root: Path) -> Path | None:
    """(Re)generate the distributable SDK wheel into ``dist/``.

    The all-in-one server image builds from source (``COPY sdk``), so it is
    always fresh. External workers, however, install the packaged wheel — which
    goes stale silently if never rebuilt. Regenerating it on every ``build`` /
    ``rebuild`` makes packaging a first-class, always-current output instead of
    a manual side step. Best-effort: a failure warns but never blocks the image
    build.
    """
    dist = root / "dist"
    dist.mkdir(exist_ok=True)
    for stale in dist.glob("mlair-*.whl"):
        try:
            stale.unlink()
        except OSError:
            pass

    print("[mlair] packaging SDK wheel -> dist/")
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "wheel", ".", "-w", str(dist), "--no-deps"],
        check=False,
    )
    if proc.returncode != 0:
        print(
            "[mlair] WARNING: SDK wheel build failed — image build continues, "
            "but external workers won't get a refreshed wheel.",
            file=sys.stderr,
        )
        return None

    wheels = sorted(dist.glob("mlair-*.whl"))
    wheel = wheels[-1] if wheels else None
    if wheel is not None:
        rel = wheel.relative_to(root)
        print(f"[mlair] SDK wheel ready: {rel}")
        _sync_wheel_to_consumers(wheel)
        print(
            "[mlair] external workers: copy this wheel into the worker image build "
            "context and `pip install --force-reinstall --no-deps` it in the Dockerfile."
        )
    return wheel


def _sync_wheel_to_consumers(wheel: Path) -> None:
    """Copy the fresh wheel into consumer vendor dirs listed in
    ``MLAIR_WHEEL_SYNC_DIR`` (os.pathsep-separated).

    Keeps MLAir decoupled — it has no knowledge of any specific project; the
    operator opts in per machine. Stale ``mlair-*.whl`` in each target is
    removed first so the consumer image build layer invalidates cleanly.
    """
    import shutil

    raw = os.getenv("MLAIR_WHEEL_SYNC_DIR", "").strip()
    if not raw:
        return
    for entry in raw.split(os.pathsep):
        target = entry.strip()
        if not target:
            continue
        dest = Path(target).expanduser()
        if not dest.is_dir():
            print(f"[mlair] WARNING: wheel sync target not a directory: {dest}", file=sys.stderr)
            continue
        for stale in dest.glob("mlair-*.whl"):
            try:
                stale.unlink()
            except OSError:
                pass
        try:
            shutil.copy2(wheel, dest / wheel.name)
            print(f"[mlair] synced wheel -> {dest / wheel.name}")
        except OSError as exc:
            print(f"[mlair] WARNING: failed to sync wheel to {dest}: {exc}", file=sys.stderr)


def _print_endpoints(cfg: dict) -> None:
    compose_rel = str((cfg.get("compose") or {}).get("file") or "")
    is_allinone = "allinone" in compose_rel
    infra = infra_enabled(cfg)
    if is_allinone:
        hub_port = os.getenv("MLAIR_PORT", "8080")
        print("[mlair] single-container stack starting")
        print(f"  MLAir:    http://localhost:{hub_port}")
        if infra.get("grafana"):
            print(f"  Grafana:  http://localhost:{os.getenv('ML_AIR_GRAFANA_PORT', '33000')}")
        if infra.get("prometheus"):
            print(f"  Prom:     http://localhost:{os.getenv('ML_AIR_PROMETHEUS_PORT', '39090')}")
        if infra.get("minio"):
            print(f"  MinIO:    http://localhost:{os.getenv('ML_AIR_MINIO_CONSOLE_PORT', '9001')}")
        if not any(infra.values()):
            print("  Infra:    MinIO / Prometheus / Grafana off (enable via mlair.yaml → infra)")
    else:
        api_port = os.getenv("ML_AIR_API_PORT", "8080")
        ui_port = os.getenv("ML_AIR_FRONTEND_PORT", "38080")
        print("[mlair] microservices stack starting")
        print(f"  API:      http://localhost:{api_port}")
        print(f"  Hub:      http://localhost:{ui_port}")
        print(f"  Realtime: ws://localhost:{os.getenv('MLAIR_REALTIME_PORT', '8001')}")
    print("  Health:   mlair health")
    print("  Docs:     docs/configuration.md")


def run_build(
    *,
    no_cache: bool = False,
    wheel: bool = True,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    """Build images only (no start). Also (re)packages the SDK wheel by default."""
    prep = _prepare(profile, config_path, ensure_env=True)
    if prep is None:
        return 1
    compose_path, cfg = prep
    print(f"[mlair] build profile={cfg.get('profile')} compose={compose_path}")
    if wheel:
        _build_sdk_wheel(repo_root())
    args = ["build"]
    if no_cache:
        args.append("--no-cache")
    return _compose(compose_path, *args)


def run_start(
    *,
    detach: bool = True,
    pull: bool = False,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    """Start the stack from existing images (no build).

    ``pull=True`` fetches the image from its registry first — use this with a
    published image (e.g. ``MLAIR_IMAGE=ghcr.io/<owner>/ml-air:latest``) so you
    can run MLAir without building from source.
    """
    prep = _prepare(profile, config_path, ensure_env=True)
    if prep is None:
        return 1
    compose_path, cfg = prep
    print(f"[mlair] start profile={cfg.get('profile')} compose={compose_path}")
    if pull:
        print(f"[mlair] pulling image {os.getenv('MLAIR_IMAGE', 'ml-air:latest')}")
        rc = _compose(compose_path, "pull")
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


def run_rebuild(
    *,
    no_cache: bool = False,
    wheel: bool = True,
    detach: bool = True,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    """Rebuild images then (re)start. Also (re)packages the SDK wheel by default."""
    prep = _prepare(profile, config_path, ensure_env=True)
    if prep is None:
        return 1
    compose_path, cfg = prep
    print(f"[mlair] rebuild profile={cfg.get('profile')} compose={compose_path}")
    if wheel:
        _build_sdk_wheel(repo_root())
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
