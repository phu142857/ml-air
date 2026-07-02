"""Resolve repository / install roots for compose and profiles."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parent
_MARKERS = ("pyproject.toml", "deploy/docker-compose.allinone.yml")


@lru_cache(maxsize=1)
def package_root() -> Path:
    return _PACKAGE_ROOT


@lru_cache(maxsize=1)
def repo_root() -> Path:
    """Best-effort monorepo root (git checkout or editable install)."""
    here = _PACKAGE_ROOT
    for parent in [here, *here.parents]:
        if any((parent / marker).is_file() for marker in _MARKERS):
            return parent
    return here.parent


def default_compose_file() -> Path:
    return repo_root() / "deploy" / "docker-compose.allinone.yml"


def profiles_dir() -> Path:
    bundled = package_root() / "profiles"
    if bundled.is_dir():
        return bundled
    repo_root_profiles = repo_root() / "deploy" / "profiles"
    if repo_root_profiles.is_dir():
        return repo_root_profiles
    return bundled


def default_env_example() -> Path:
    return repo_root() / ".env.example"
