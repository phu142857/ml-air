"""Load project-root ``.env`` for the MLAir CLI and Docker Compose."""

from __future__ import annotations

import os
from pathlib import Path

from mlair.paths import default_env_file


def load_project_env(*, override_existing: bool = False) -> Path | None:
    """Parse repo-root ``.env`` into ``os.environ`` (shell exports win by default)."""
    path = default_env_file()
    if not path.is_file():
        return None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if not override_existing and key in os.environ:
            continue
        os.environ[key] = value
    return path
