"""Docker Compose invocation with repo-root ``.env`` (never ``deploy/.env``)."""

from __future__ import annotations

import subprocess
from pathlib import Path

from mlair.env import load_project_env
from mlair.paths import default_env_file


def compose_argv(compose_path: Path, *args: str) -> list[str]:
    """Build ``docker compose`` argv with repo-root ``.env`` for variable interpolation.

    Compose project directory stays the compose file's folder (``deploy/``) so paths like
    ``context: ..`` and ``./monitoring/...`` volumes keep working. Only ``--env-file``
    points at the project-root ``.env`` — no copy into ``deploy/`` required.
    """
    compose_path = compose_path.resolve()
    cmd: list[str] = [
        "docker",
        "compose",
        "-f",
        str(compose_path),
    ]
    env_file = default_env_file()
    if env_file.is_file():
        cmd.extend(["--env-file", str(env_file.resolve())])
    cmd.extend(args)
    return cmd


def run_compose(compose_path: Path, *args: str) -> int:
    load_project_env()
    proc = subprocess.run(compose_argv(compose_path, *args), check=False)
    return proc.returncode
