"""Load project-root ``.env`` for the MLAir CLI and Docker Compose."""

from __future__ import annotations

import os
import re
from pathlib import Path

from mlair.paths import default_env_file

_UNEXPANDED_COMPOSE_DEFAULT = re.compile(r"^\$\{[^:]+:-([^}]+)\}$")

# Values that break all-in-one when copied from quickstart examples or left unexpanded by podman-compose.
_ALLINONE_ENV_FIXES: dict[str, str] = {
    "ML_AIR_SCHEDULER_METRICS_PORT": "9102",
    "ML_AIR_EXECUTOR_METRICS_PORT": "9103",
    "ML_AIR_REALTIME_METRICS_PORT": "9104",
    "ML_AIR_REDIS_URL": "redis://127.0.0.1:6379/0",
    "ML_AIR_DATABASE_URL": "postgresql://mlair:mlair@127.0.0.1:5432/mlair?client_encoding=utf8",
    "ML_AIR_API_BASE_URL": "http://127.0.0.1:18080",
}


def sanitize_env_value(key: str, value: str, *, allinone: bool = False) -> str:
    """Normalize .env values (unexpanded ``${VAR:-default}``, quickstart hostnames)."""
    raw = (value or "").strip()
    if not raw:
        return raw
    m = _UNEXPANDED_COMPOSE_DEFAULT.match(raw)
    if m:
        return m.group(1)
    if "${" in raw and key in _ALLINONE_ENV_FIXES:
        return _ALLINONE_ENV_FIXES[key]
    if not allinone:
        return raw
    if key == "ML_AIR_REDIS_URL" and "redis://redis:" in raw:
        return _ALLINONE_ENV_FIXES[key]
    if key == "ML_AIR_DATABASE_URL" and "@postgres:" in raw:
        return _ALLINONE_ENV_FIXES[key]
    if key == "ML_AIR_API_BASE_URL" and "://api:" in raw:
        return _ALLINONE_ENV_FIXES[key]
    return raw


def load_project_env(*, override_existing: bool = False, allinone: bool | None = None) -> Path | None:
    """Parse repo-root ``.env`` into ``os.environ`` (shell exports win by default)."""
    path = default_env_file()
    if not path.is_file():
        return None
    if allinone is None:
        compose = os.getenv("MLAIR_COMPOSE_FILE", os.getenv("COMPOSE_FILE", ""))
        allinone = "allinone" in str(compose)
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
        value = sanitize_env_value(key, value, allinone=allinone)
        if not override_existing and key in os.environ:
            continue
        os.environ[key] = value
    return path


def find_semantic_signing_issues() -> list[str]:
    """Return errors when semantic event signing is enabled without a configured key."""
    try:
        from sdk.event_signing import signing_enabled, signing_key_configured
    except ImportError:
        return []
    if not signing_enabled():
        return []
    if signing_key_configured():
        return []
    return [
        "ML_AIR_SEMANTIC_EVENT_SIGNING=1 but no signing key is set "
        "(set ML_AIR_SEMANTIC_EVENT_SIGNING_KEY or ML_AIR_SEMANTIC_EVENT_SIGNING_KEYS_JSON; "
        "see .env.example) — Hub realtime events will not publish"
    ]


def find_env_issues(*, allinone: bool) -> list[str]:
    """Return human-readable warnings for problematic ``.env`` entries."""
    path = default_env_file()
    if not path.is_file():
        return []
    issues: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if "${" in value:
            issues.append(f"{key} contains unexpanded compose syntax ({value!r})")
        if not allinone:
            continue
        if key == "ML_AIR_REDIS_URL" and "redis://redis:" in value:
            issues.append(f"{key} uses quickstart hostname redis: — use redis://127.0.0.1:6379/0 for all-in-one")
        if key == "ML_AIR_DATABASE_URL" and "@postgres:" in value:
            issues.append(f"{key} uses quickstart hostname postgres: — use 127.0.0.1 for all-in-one")
    issues.extend(find_semantic_signing_issues())
    return issues
