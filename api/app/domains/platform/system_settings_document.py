"""L4 system settings document schema and seed builder (Package 002 Phase 2)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

SCHEMA_VERSION = 1
SINGLETON_ID = "default"
_HUB_ROUTES = frozenset({"datasets", "lifecycle", "dashboard", "models"})


def _feature_map() -> dict[str, str]:
    try:
        from app.settings.feature_env_map import feature_env_map

        return feature_env_map()
    except ImportError:
        from mlair.config.loader import _FEATURE_ENV_MAP

        return dict(_FEATURE_ENV_MAP)


def build_seed_settings(profile_cfg: dict[str, Any]) -> dict[str, Any]:
    """Seed L4 document from L2 profile bundle (+ L1 via profile merge)."""
    features_in = profile_cfg.get("features") if isinstance(profile_cfg.get("features"), dict) else {}
    observability = profile_cfg.get("observability") if isinstance(profile_cfg.get("observability"), dict) else {}

    features: dict[str, bool] = {}
    for feature_key in _feature_map():
        if feature_key in features_in:
            features[feature_key] = bool(features_in[feature_key])
        else:
            features[feature_key] = True

    features["plugin_version_enforcement"] = True
    features["legacy_static_tokens"] = False

    hub_route = "datasets"
    promotion_order = list(features_in.get("promotion_stage_order") or ("staging", "production"))
    if isinstance(promotion_order, str):
        promotion_order = [p.strip() for p in promotion_order.split(",") if p.strip()]

    grafana = str(observability.get("grafana_url") or "").strip() or None

    return {
        "hub": {"default_route": hub_route},
        "telemetry": {
            "grafana_ui_url": grafana,
            "trace_span_retention_days": 30,
            "trace_sample_ratio": 1.0,
        },
        "identity": {
            "lockout_threshold": 5,
            "lockout_minutes": 15,
            "password_min_length": 8,
            "access_token_ttl_seconds": 900,
            "refresh_token_ttl_seconds": 604800,
        },
        "governance": {
            "promotion_stage_order": promotion_order or ["staging", "production"],
            "rollback_enabled": bool(features_in.get("rollback_enabled", True)),
            "rollback_requires_approval": bool(features_in.get("rollback_requires_approval", True)),
            "promotion_allow_skip_stages": bool(features_in.get("promotion_allow_skip_stages", True)),
            "skip_approval_for_promote": bool(features_in.get("skip_approval_for_promote", True)),
            "promotion_approval_stages": ["production"],
            "replay_require_checksum": bool(features_in.get("replay_require_checksum", True)),
            "replay_require_signed_manifest": bool(features_in.get("replay_require_signed_manifest", True)),
            "quota_defaults": {
                "max_projects": 200,
                "max_datasets_per_project": 500,
                "max_models_per_project": 200,
                "max_runs_per_project": 50_000,
                "max_webhook_subscriptions_per_project": 50,
                "max_parallel_tasks": 1000,
            },
            "webhook_allowed_hosts": [],
        },
        "features": features,
    }


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(base)
    for key, val in overlay.items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def validate_settings_patch(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Merge and validate a partial settings update."""
    merged = _deep_merge(current, patch)

    hub = merged.get("hub")
    if isinstance(hub, dict):
        route = str(hub.get("default_route") or "datasets").strip().lower()
        if route not in _HUB_ROUTES:
            raise ValueError(f"hub.default_route must be one of: {', '.join(sorted(_HUB_ROUTES))}")
        hub["default_route"] = route

        identity = merged.get("identity")
    if isinstance(identity, dict):
        threshold = int(identity.get("lockout_threshold", 5))
        minutes = int(identity.get("lockout_minutes", 15))
        identity["lockout_threshold"] = max(1, min(threshold, 100))
        identity["lockout_minutes"] = max(1, min(minutes, 24 * 60))
        min_pw = int(identity.get("password_min_length", 8))
        identity["password_min_length"] = max(6, min(min_pw, 128))
        access_ttl = int(identity.get("access_token_ttl_seconds", 900))
        identity["access_token_ttl_seconds"] = max(60, min(access_ttl, 86400))
        refresh_ttl = int(identity.get("refresh_token_ttl_seconds", 604800))
        identity["refresh_token_ttl_seconds"] = max(3600, min(refresh_ttl, 90 * 24 * 3600))

    telemetry = merged.get("telemetry")
    if isinstance(telemetry, dict):
        days = int(telemetry.get("trace_span_retention_days", 30))
        telemetry["trace_span_retention_days"] = max(1, min(days, 3650))
        ratio = float(telemetry.get("trace_sample_ratio", 1.0))
        telemetry["trace_sample_ratio"] = max(0.0, min(ratio, 1.0))
        grafana = telemetry.get("grafana_ui_url")
        if grafana is not None and str(grafana).strip() == "":
            telemetry["grafana_ui_url"] = None

    governance = merged.get("governance")
    if isinstance(governance, dict):
        order = governance.get("promotion_stage_order")
        if order is not None:
            if isinstance(order, str):
                parts = [p.strip().lower() for p in order.split(",") if p.strip()]
            elif isinstance(order, list):
                parts = [str(p).strip().lower() for p in order if str(p).strip()]
            else:
                raise ValueError("governance.promotion_stage_order must be a list or comma-separated string")
            if not parts:
                raise ValueError("governance.promotion_stage_order must not be empty")
            governance["promotion_stage_order"] = parts

        stages = governance.get("promotion_approval_stages")
        if stages is not None:
            if isinstance(stages, str):
                governance["promotion_approval_stages"] = [
                    p.strip().lower() for p in stages.split(",") if p.strip()
                ]
            elif isinstance(stages, list):
                governance["promotion_approval_stages"] = [
                    str(p).strip().lower() for p in stages if str(p).strip()
                ]
            else:
                raise ValueError("governance.promotion_approval_stages must be a list")

        quota_defaults = governance.get("quota_defaults")
        if quota_defaults is not None:
            if not isinstance(quota_defaults, dict):
                raise ValueError("governance.quota_defaults must be an object")
            validated: dict[str, int] = {}
            for key in (
                "max_projects",
                "max_datasets_per_project",
                "max_models_per_project",
                "max_runs_per_project",
                "max_webhook_subscriptions_per_project",
                "max_parallel_tasks",
            ):
                if key not in quota_defaults:
                    continue
                val = quota_defaults[key]
                if val is None:
                    continue
                try:
                    n = int(val)
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"governance.quota_defaults.{key} must be an integer") from exc
                if n < 1:
                    raise ValueError(f"governance.quota_defaults.{key} must be >= 1")
                validated[key] = n
            governance["quota_defaults"] = validated

        webhook_hosts = governance.get("webhook_allowed_hosts")
        if webhook_hosts is not None:
            if isinstance(webhook_hosts, str):
                governance["webhook_allowed_hosts"] = [
                    h.strip().lower() for h in webhook_hosts.split(",") if h.strip()
                ]
            elif isinstance(webhook_hosts, list):
                governance["webhook_allowed_hosts"] = sorted(
                    {str(h).strip().lower() for h in webhook_hosts if str(h).strip()}
                )
            else:
                raise ValueError("governance.webhook_allowed_hosts must be a list or comma-separated string")

    features = merged.get("features")
    if isinstance(features, dict):
        for key, val in list(features.items()):
            if not isinstance(val, bool):
                if str(val).strip().lower() in {"1", "true", "yes", "on"}:
                    features[key] = True
                elif str(val).strip().lower() in {"0", "false", "no", "off"}:
                    features[key] = False
                else:
                    raise ValueError(f"features.{key} must be boolean")

    return merged


def public_document(*, settings: dict[str, Any], schema_version: int, updated_at: str, updated_by: str | None) -> dict[str, Any]:
    return {
        "schema_version": schema_version,
        "settings": settings,
        "updated_at": updated_at,
        "updated_by": updated_by,
    }
