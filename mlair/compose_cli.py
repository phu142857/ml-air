"""Docker Compose invocation with repo-root ``.env`` (never ``deploy/.env``)."""

from __future__ import annotations

import subprocess
from pathlib import Path

from mlair.env import load_project_env
from mlair.paths import default_env_file, repo_root


def compose_argv(compose_path: Path, *args: str) -> list[str]:
    """Build ``docker compose`` argv: project dir = repo root, env file = ``.env`` there."""
    root = repo_root()
    compose_path = compose_path.resolve()
    cmd: list[str] = [
        "docker",
        "compose",
        "--project-directory",
        str(root),
        "-f",
        str(compose_path),
    ]
    env_file = default_env_file()
    if env_file.is_file():
        cmd.extend(["--env-file", str(env_file)])
    cmd.extend(args)
    return cmd


def run_compose(compose_path: Path, *args: str) -> int:
    load_project_env()
    proc = subprocess.run(compose_argv(compose_path, *args), check=False)
    return proc.returncode
