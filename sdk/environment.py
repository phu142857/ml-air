"""Best-effort runtime environment capture for reproducibility bundles."""

from __future__ import annotations

import hashlib
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _run_git(args: list[str], cwd: str | None = None) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        if out.returncode != 0:
            return None
        text = (out.stdout or "").strip()
        return text or None
    except (OSError, subprocess.SubprocessError):
        return None


def _git_roots() -> list[str]:
    roots: list[str] = []
    explicit = os.getenv("ML_AIR_GIT_ROOT", "").strip()
    if explicit:
        roots.append(explicit)
    for candidate in ("/app", os.getcwd()):
        if candidate and candidate not in roots and Path(candidate, ".git").exists():
            roots.append(candidate)
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".git").exists():
            path = str(parent)
            if path not in roots:
                roots.append(path)
            break
    return roots


def _git_from_build_env() -> dict[str, Any]:
    commit = (
        os.getenv("MLAIR_SOURCE_COMMIT", "").strip()
        or os.getenv("SOURCE_COMMIT", "").strip()
        or os.getenv("ML_AIR_SOURCE_COMMIT", "").strip()
    )
    branch = (
        os.getenv("MLAIR_SOURCE_BRANCH", "").strip()
        or os.getenv("SOURCE_BRANCH", "").strip()
        or os.getenv("ML_AIR_SOURCE_BRANCH", "").strip()
    )
    if not commit and not branch:
        return {}
    return {
        "commit": commit or None,
        "branch": branch or None,
        "dirty": None,
        "source": "build",
    }


def _git_info() -> dict[str, Any]:
    for root in _git_roots():
        commit = _run_git(["rev-parse", "HEAD"], cwd=root)
        branch = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=root)
        if not commit and not branch:
            continue
        dirty = None
        if commit:
            status = _run_git(["status", "--porcelain"], cwd=root)
            dirty = bool(status)
        info: dict[str, Any] = {
            "commit": commit,
            "branch": branch,
            "dirty": dirty,
            "root": root,
        }
        return info
    return _git_from_build_env()


def _cuda_info() -> dict[str, str]:
    for key in ("MLAIR_CUDA_VERSION", "CUDA_VERSION"):
        val = os.getenv(key, "").strip()
        if val:
            return {"cuda_version": val}
    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=driver_version,name",
                "--format=csv,noheader",
            ],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        if out.returncode == 0 and (out.stdout or "").strip():
            line = out.stdout.strip().splitlines()[0]
            parts = [p.strip() for p in line.split(",")]
            info: dict[str, str] = {}
            if parts:
                info["cuda_version"] = f"driver:{parts[0]}"
            if len(parts) > 1 and parts[1]:
                info["gpu_name"] = parts[1]
            if info:
                return info
    except (OSError, subprocess.SubprocessError):
        pass
    cuda_home = Path("/usr/local/cuda/version.txt")
    if cuda_home.is_file():
        text = cuda_home.read_text(encoding="utf-8", errors="ignore").strip()
        if text:
            return {"cuda_version": text.split()[-1]}
    return {}


def _docker_image() -> str | None:
    for key in (
        "ML_AIR_DOCKER_IMAGE",
        "MLAIR_DOCKER_IMAGE",
        "CONTAINER_IMAGE",
        "IMAGE_NAME",
        "MLAIR_IMAGE_REF",
        "MLAIR_API_IMAGE",
        "MLAIR_SCHEDULER_IMAGE",
        "MLAIR_EXECUTOR_IMAGE",
    ):
        val = os.getenv(key, "").strip()
        if val:
            return val
    return None


def _runtime_kind() -> str:
    if os.getenv("KUBERNETES_SERVICE_HOST", "").strip():
        return "kubernetes"
    if Path("/.dockerenv").exists() or Path("/run/.containerenv").exists():
        return "container"
    return "bare_metal"


def _service_name() -> str | None:
    for key in ("OTEL_SERVICE_NAME", "MLAIR_SERVICE_NAME", "ML_AIR_SERVICE_NAME"):
        val = os.getenv(key, "").strip()
        if val:
            return val
    return None


def _ml_air_environment() -> str | None:
    val = os.getenv("ML_AIR_ENVIRONMENT", "").strip()
    return val or None


def _memory_total_mb() -> int | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("MemTotal:"):
                    kb = int(line.split()[1])
                    return max(1, round(kb / 1024))
    except (OSError, ValueError, IndexError):
        pass
    return None


def _timezone_name() -> str | None:
    tz = os.getenv("TZ", "").strip()
    if tz:
        return tz
    try:
        return time.tzname[0] or None
    except (AttributeError, IndexError):
        return None


def _pip_freeze_digest() -> str | None:
    if os.getenv("ML_AIR_CAPTURE_PIP_FREEZE", "1").strip().lower() in ("0", "false", "no"):
        return None
    try:
        out = subprocess.run(
            [sys.executable, "-m", "pip", "freeze"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if out.returncode != 0:
            return None
        body = (out.stdout or "").strip()
        if not body:
            return None
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
        return f"sha256:{digest}"
    except (OSError, subprocess.SubprocessError):
        return None


def collect_environment(*, include_pip_digest: bool = True, capturer: str | None = None) -> dict[str, Any]:
    """Capture runtime metadata for ``runs.environment`` JSON."""
    env: dict[str, Any] = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "python_version": sys.version.split()[0],
        "python_implementation": platform.python_implementation(),
        "platform": platform.platform(),
        "hostname": platform.node() or None,
        "machine": platform.machine() or None,
        "processor": platform.processor() or None,
        "cpu_count": os.cpu_count(),
        "runtime_kind": _runtime_kind(),
    }
    if capturer:
        env["capturer"] = capturer
    ml_env = _ml_air_environment()
    if ml_env:
        env["ml_air_environment"] = ml_env
    service = _service_name()
    if service:
        env["service_name"] = service
    mem_mb = _memory_total_mb()
    if mem_mb is not None:
        env["memory_total_mb"] = mem_mb
    tz = _timezone_name()
    if tz:
        env["timezone"] = tz
    env.update(_cuda_info())
    git = _git_info()
    if git:
        env["git"] = git
    docker_image = _docker_image()
    if docker_image:
        env["docker_image"] = docker_image
    if include_pip_digest:
        digest = _pip_freeze_digest()
        if digest:
            env["python_packages_digest"] = digest
    seed = os.getenv("ML_AIR_RANDOM_SEED", "").strip() or os.getenv("PYTHONHASHSEED", "").strip()
    if seed:
        env["random_seed"] = seed
    return {k: v for k, v in env.items() if v is not None}
