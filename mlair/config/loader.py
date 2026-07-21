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
        "strict_dataset_version_required": True,
        "strict_dataset_version_all_post_runs": True,
        "readiness_allow_legacy_fallback": True,
        "skip_approval_for_promote": True,
        "warn_implicit_dataset_head": True,
        "lineage_legacy_default_version_label": True,
        "dataset_hub_v2": True,
        "scope_debug_panel": True,
        "serving_slots_http": True,
        "otel_enabled": True,
        "event_outbox": True,
        "event_stream": True,
        "event_stream_global_fanout": True,
        "execution_projection": True,
        "semantic_event_signing": True,
        "semantic_event_validate": True,
        "semantic_webhook_delivery": True,
        "semantic_webhook_dedupe": True,
        "readiness_async_queue": True,
        "tenant_quota_enforce": True,
        "dataset_retention_policies": True,
        "http_pipeline_tasks": True,
        "http_task_templates": True,
        "validate_plugin_exists_on_create": True,
        "require_declared_dataset_inputs": True,
        "validate_dataset_version_checksum": True,
        "rollback_enabled": True,
        "rollback_requires_approval": True,
        "promotion_allow_skip_stages": True,
        "replay_require_checksum": True,
        "replay_require_signed_manifest": True,
        "manifest_strict_key_lifecycle": True,
    },
    "infra": {
        "minio": False,
        "prometheus": False,
        "grafana": False,
    },
    "observability": {
        "otel_enabled": True,
    },
    "auth": {"tracking_token": ""},
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
    "dataset_hub_v2": "ML_AIR_FEATURE_DATASET_HUB_V2",
    "scope_debug_panel": "ML_AIR_FEATURE_SCOPE_DEBUG_PANEL",
    "serving_slots_http": "ML_AIR_ENABLE_SERVING_SLOTS_HTTP",
    "otel_enabled": "ML_AIR_OTEL_ENABLED",
    "event_outbox": "ML_AIR_EVENT_OUTBOX",
    "event_stream": "ML_AIR_EVENT_STREAM",
    "event_stream_global_fanout": "ML_AIR_EVENT_STREAM_GLOBAL_FANOUT",
    "execution_projection": "ML_AIR_EXECUTION_PROJECTION",
    "semantic_event_signing": "ML_AIR_SEMANTIC_EVENT_SIGNING",
    "semantic_event_validate": "ML_AIR_SEMANTIC_EVENT_VALIDATE",
    "semantic_webhook_delivery": "ML_AIR_SEMANTIC_WEBHOOK_DELIVERY",
    "semantic_webhook_dedupe": "ML_AIR_SEMANTIC_WEBHOOK_DEDUPE",
    "readiness_async_queue": "ML_AIR_READINESS_ASYNC_QUEUE",
    "tenant_quota_enforce": "ML_AIR_TENANT_QUOTA_ENFORCE",
    "dataset_retention_policies": "ML_AIR_DATASET_RETENTION_POLICIES",
    "http_pipeline_tasks": "ML_AIR_HTTP_PIPELINE_TASKS",
    "http_task_templates": "ML_AIR_HTTP_TASK_TEMPLATES",
    "validate_plugin_exists_on_create": "ML_AIR_VALIDATE_PLUGIN_EXISTS_ON_CREATE",
    "require_declared_dataset_inputs": "ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS",
    "validate_dataset_version_checksum": "ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM",
    "rollback_enabled": "ML_AIR_ROLLBACK_ENABLED",
    "rollback_requires_approval": "ML_AIR_ROLLBACK_REQUIRES_APPROVAL",
    "promotion_allow_skip_stages": "ML_AIR_PROMOTION_ALLOW_SKIP_STAGES",
    "replay_require_checksum": "ML_AIR_REPLAY_REQUIRE_CHECKSUM",
    "replay_require_signed_manifest": "ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST",
    "manifest_strict_key_lifecycle": "ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE",
}

_INFRA_ENV_MAP = {
    "minio": "MLAIR_INFRA_MINIO",
    "prometheus": "MLAIR_INFRA_PROMETHEUS",
    "grafana": "MLAIR_INFRA_GRAFANA",
}


def _bool_env(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return "1"
    if text in ("0", "false", "no", "off"):
        return "0"
    return str(value)


def _truthy(value: Any) -> bool:
    return _bool_env(value) == "1"


def infra_enabled(cfg: dict[str, Any]) -> dict[str, bool]:
    """Resolved optional all-in-one sidecars (MinIO / Prometheus / Grafana)."""
    infra = cfg.get("infra") if isinstance(cfg.get("infra"), dict) else {}
    grafana = _truthy(infra.get("grafana"))
    prometheus = _truthy(infra.get("prometheus")) or grafana
    return {
        "minio": _truthy(infra.get("minio")),
        "prometheus": prometheus,
        "grafana": grafana,
    }


def compose_profiles(cfg: dict[str, Any]) -> tuple[str, ...]:
    """Docker Compose profile names for optional infra services."""
    enabled = infra_enabled(cfg)
    profiles: list[str] = []
    for name in ("minio", "prometheus", "grafana"):
        if enabled.get(name):
            profiles.append(name)
    return tuple(profiles)


_PORT_ENV_MAP = {
    "hub": "MLAIR_PORT",
    "api": "ML_AIR_API_PORT",
    "frontend": "ML_AIR_FRONTEND_PORT",
    "redis": "ML_AIR_REDIS_PORT",
    "postgres": "ML_AIR_POSTGRES_PORT",
    "grafana": "ML_AIR_GRAFANA_PORT",
    "prometheus": "ML_AIR_PROMETHEUS_PORT",
    "minio_api": "ML_AIR_MINIO_API_PORT",
    "minio_console": "ML_AIR_MINIO_CONSOLE_PORT",
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
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
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
    env_mapping = to_env_mapping(cfg)
    display["_effective_env"] = {
        k: ("***" if "SECRET" in k or "TOKEN" in k or "PASSWORD" in k else v)
        for k, v in sorted(env_mapping.items())
    }
    display["_layers"] = layered_config(cfg, env_mapping)
    return display


def layered_config(cfg: dict[str, Any], env_mapping: dict[str, str] | None = None) -> dict[str, Any]:
    """L1/L2/L3 breakdown for ``mlair config print`` (Package 002 Phase 1)."""
    active_profile = str(cfg.get("profile") or "development")
    l1 = deepcopy(_BUILTIN_DEFAULTS)
    l1.pop("compose", None)
    profile_overlay = _read_yaml(_profile_path(active_profile))
    l2 = _deep_merge(
        {
            "profile": active_profile,
            "features": deepcopy(_BUILTIN_DEFAULTS.get("features", {})),
            "infra": deepcopy(_BUILTIN_DEFAULTS.get("infra", {})),
            "observability": deepcopy(_BUILTIN_DEFAULTS.get("observability", {})),
        },
        profile_overlay,
    )
    mapping = env_mapping if env_mapping is not None else to_env_mapping(cfg)
    l3_keys = sorted(k for k in mapping if k in os.environ)
    l3 = {k: os.environ[k] for k in l3_keys}
    return {
        "L1_builtin_defaults": l1,
        "L2_profile": {"file": str(_profile_path(active_profile)), "overlay": profile_overlay},
        "L2_merged": l2,
        "L3_env_overrides": l3,
    }


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
    infra = infra_enabled(cfg)
    for key, env_name in _INFRA_ENV_MAP.items():
        env[env_name] = "1" if infra.get(key) else "0"
    profiles = compose_profiles(cfg)
    env["COMPOSE_PROFILES"] = ",".join(profiles) if profiles else ""
    if infra.get("grafana"):
        grafana_port = ports.get("grafana", 33000)
        default_grafana = f"http://localhost:{grafana_port}"
        grafana_url = str(observability.get("grafana_url") or default_grafana).strip()
        if grafana_url:
            env["ML_AIR_GRAFANA_URL"] = grafana_url
    realtime_ws = str(observability.get("realtime_ws") or "").strip()
    if realtime_ws:
        env["ML_AIR_RUNTIME_REALTIME_BASE_URL"] = realtime_ws
    if observability.get("otel_enabled") is not None:
        env["ML_AIR_OTEL_ENABLED"] = _bool_env(observability["otel_enabled"])

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
    if "COMPOSE_PROFILES" in mapping:
        os.environ["COMPOSE_PROFILES"] = mapping["COMPOSE_PROFILES"]
    return mapping
