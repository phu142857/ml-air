"""Load mlair.yaml + profiles into MLAir environment variables."""

from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

from mlair.paths import profiles_dir, repo_root

_BUILTIN_DEFAULTS: dict[str, Any] = {
    "profile": "development",
    "ml_air_environment": "development",
    "compose": {"file": "deploy/docker-compose.allinone.yml"},
    "ports": {"hub": 8080},
    "features": {
        "usage_tracking": True,
        "resource_monitor": True,
        "strict_dataset_version_required": False,
        "strict_dataset_version_all_post_runs": False,
        "readiness_allow_legacy_fallback": True,
        "skip_approval_for_promote": True,
    },
    "auth": {"tracking_token": "admin-token"},
}

_FEATURE_ENV_MAP = {
    "usage_tracking": "ML_AIR_USAGE_TRACKING_ENABLED",
    "resource_monitor": "ML_AIR_RESOURCE_MONITOR_ENABLED",
    "strict_dataset_version_required": "ML_AIR_STRICT_DATASET_VERSION_REQUIRED",
    "strict_dataset_version_all_post_runs": "ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS",
    "readiness_allow_legacy_fallback": "ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK",
    "skip_approval_for_promote": "ML_AIR_SKIP_APPROVAL_FOR_PROMOTE",
    "warn_implicit_dataset_head": "ML_AIR_WARN_IMPLICIT_DATASET_HEAD",
    "lineage_legacy_default_version_label": "ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL",
}

_PORT_ENV_MAP = {
    "hub": "MLAIR_PORT",
    "api": "ML_AIR_API_PORT",
    "frontend": "ML_AIR_FRONTEND_PORT",
    "redis": "ML_AIR_REDIS_PORT",
    "postgres": "ML_AIR_POSTGRES_PORT",
    "grafana": "ML_AIR_GRAFANA_PORT",
    "prometheus": "ML_AIR_PROMETHEUS_PORT",
}


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(base)
    for key, val in overlay.items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _profile_path(profile: str) -> Path:
    name = f"{profile}.yaml"
    for directory in (profiles_dir(), repo_root() / "deploy" / "profiles"):
        candidate = directory / name
        if candidate.is_file():
            return candidate
    return profiles_dir() / name


def _discover_user_config(explicit: str | None) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.is_file() else None
    for candidate in (
        Path.cwd() / "mlair.yaml",
        Path.cwd() / "mlair.yml",
        Path.home() / ".config" / "mlair" / "mlair.yaml",
    ):
        if candidate.is_file():
            return candidate
    return None


def load_config(
    config_path: str | None = None,
    *,
    profile: str | None = None,
) -> dict[str, Any]:
    """Merge built-in defaults → profile → user mlair.yaml."""
    cfg = deepcopy(_BUILTIN_DEFAULTS)
    user_path = _discover_user_config(config_path)
    user_cfg = _read_yaml(user_path) if user_path else {}

    active_profile = (
        profile
        or str(user_cfg.get("profile") or "").strip()
        or str(cfg.get("profile") or "development")
    )
    cfg["profile"] = active_profile
    cfg = _deep_merge(cfg, _read_yaml(_profile_path(active_profile)))
    cfg = _deep_merge(cfg, user_cfg)
    if profile:
        cfg["profile"] = profile
    cfg["_meta"] = {
        "profile": cfg.get("profile"),
        "user_config": str(user_path) if user_path else None,
        "profile_file": str(_profile_path(active_profile)),
    }
    return cfg


def resolved_config(
    config_path: str | None = None,
    *,
    profile: str | None = None,
) -> dict[str, Any]:
    """Config with env overlay for display (secrets redacted)."""
    cfg = load_config(config_path, profile=profile)
    display = deepcopy(cfg)
    token = display.get("auth", {}).get("tracking_token")
    if token:
        display.setdefault("auth", {})["tracking_token"] = "***"
    display["_effective_env"] = {
        k: ("***" if "SECRET" in k or "TOKEN" in k or "PASSWORD" in k else v)
        for k, v in sorted(to_env_mapping(cfg).items())
    }
    return display


def _bool_env(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return "1"
    if text in ("0", "false", "no", "off"):
        return "0"
    return str(value)


def to_env_mapping(cfg: dict[str, Any]) -> dict[str, str]:
    """Flatten resolved config to ML_AIR_* variables for compose / subprocess."""
    env: dict[str, str] = {}
    if cfg.get("ml_air_environment"):
        env["ML_AIR_ENVIRONMENT"] = str(cfg["ml_air_environment"])

    features = cfg.get("features") if isinstance(cfg.get("features"), dict) else {}
    for key, env_name in _FEATURE_ENV_MAP.items():
        if key in features:
            env[env_name] = _bool_env(features[key])

    ports = cfg.get("ports") if isinstance(cfg.get("ports"), dict) else {}
    for key, env_name in _PORT_ENV_MAP.items():
        if key in ports and ports[key] is not None:
            env[env_name] = str(ports[key])

    observability = cfg.get("observability") if isinstance(cfg.get("observability"), dict) else {}
    if observability.get("grafana_url"):
        env["ML_AIR_GRAFANA_URL"] = str(observability["grafana_url"])
    if observability.get("realtime_ws"):
        env["ML_AIR_RUNTIME_REALTIME_BASE_URL"] = str(observability["realtime_ws"])

    auth = cfg.get("auth") if isinstance(cfg.get("auth"), dict) else {}
    if auth.get("tracking_token"):
        env["ML_AIR_TRACKING_TOKEN"] = str(auth["tracking_token"])

    compose = cfg.get("compose") if isinstance(cfg.get("compose"), dict) else {}
    if compose.get("file"):
        env["MLAIR_COMPOSE_FILE"] = str(compose["file"])

    compose = cfg.get("compose") if isinstance(cfg.get("compose"), dict) else {}
    compose_file = str(compose.get("file") or "")
    is_allinone = "allinone" in compose_file

    api_port = ports.get("api")
    hub_port = ports.get("hub")
    frontend_port = ports.get("frontend")

    if is_allinone:
        public_port = hub_port if hub_port is not None else frontend_port if frontend_port is not None else 8080
        env.setdefault("MLAIR_PORT", str(public_port))
        env.setdefault("ML_AIR_API_BASE_URL", f"http://localhost:{public_port}")
        env.setdefault("ML_AIR_BASE_URL", f"http://localhost:{public_port}")
    else:
        api_port = api_port if api_port is not None else 8080
        env.setdefault("ML_AIR_API_BASE_URL", f"http://localhost:{api_port}")
        env.setdefault("ML_AIR_BASE_URL", f"http://localhost:{api_port}")
        if frontend_port is not None:
            env.setdefault("ML_AIR_FRONTEND_BASE_URL", f"http://localhost:{frontend_port}")

    return env


def apply_to_environ(
    cfg: dict[str, Any],
    *,
    override_existing: bool = False,
) -> dict[str, str]:
    """Apply config env mapping to ``os.environ``; return mapping applied."""
    mapping = to_env_mapping(cfg)
    for key, value in mapping.items():
        if override_existing or key not in os.environ:
            os.environ[key] = value
    return mapping
