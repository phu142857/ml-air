"""Resolve L2 profile → L3 env → L1 defaults into a single Settings object."""

from __future__ import annotations

import os
from typing import Any

from app.settings.models import (
    AuthSettings,
    FeatureFlags,
    IdentitySettings,
    ObservabilitySettings,
    PromotionSettings,
    Settings,
)

# L1 defaults for keys outside profile feature bundles.
_IDENTITY_LOCKOUT_THRESHOLD = 5
_IDENTITY_LOCKOUT_MINUTES = 15
_DEFAULT_PROMOTION_STAGE_ORDER = ("staging", "production")
_DEFAULT_JWT_JWKS_TTL = 300
_DEFAULT_TRACE_RETENTION_DAYS = 30
_DEFAULT_TRACE_SAMPLE_RATIO = 1.0
_HUB_ROUTES = frozenset({"datasets", "lifecycle", "dashboard", "models"})

from app.settings.l4_overlay import (
    get_l4_overlay,
    l4_bool,
    l4_feature_bool,
    l4_float,
    l4_int,
    l4_stage_order,
    l4_str,
)
from app.settings.feature_env_map import feature_env_map
from app.settings.policy_env import use_l4_first_policy

_EXTRA_FEATURE_ENV: dict[str, str] = {
    "plugin_version_enforcement": "MLAIR_PLUGIN_VERSION_ENFORCE",
    "legacy_static_tokens": "ML_AIR_LEGACY_STATIC_TOKENS",
}


def _profile_bundle() -> dict[str, Any]:
    profile = os.getenv("MLAIR_PROFILE", "").strip() or None
    try:
        from mlair.config.loader import load_config

        return load_config(profile=profile)
    except (ImportError, OSError, PermissionError):
        return {"profile": profile or "development", "features": {}}


def _parse_bool(raw: str | None, *, default: bool) -> bool:
    if raw is None:
        return default
    text = str(raw).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _l1_feature_default(feature_key: str, *, fallback: bool = True) -> bool:
    try:
        from mlair.config.loader import _BUILTIN_DEFAULTS

        features = _BUILTIN_DEFAULTS.get("features")
        if isinstance(features, dict) and feature_key in features:
            return bool(features[feature_key])
    except ImportError:
        pass
    return fallback


def _resolve_bool(
    env_key: str,
    feature_key: str | None,
    profile_cfg: dict[str, Any],
    l4: dict[str, Any] | None,
    *,
    default: bool | None = None,
    governance_key: str | None = None,
) -> bool:
    l4_first = use_l4_first_policy(l4)

    if feature_key and l4_first:
        l4_val = l4_feature_bool(l4, feature_key)
        if l4_val is not None:
            return l4_val
    if governance_key and l4_first:
        gov_val = l4_bool(l4, "governance", governance_key)
        if gov_val is not None:
            return gov_val

    if not l4_first and env_key in os.environ:
        resolved_default = default if default is not None else True
        return _parse_bool(os.environ.get(env_key), default=resolved_default)

    if feature_key:
        if not l4_first:
            l4_val = l4_feature_bool(l4, feature_key)
            if l4_val is not None:
                return l4_val
        features = profile_cfg.get("features")
        if isinstance(features, dict) and feature_key in features:
            return bool(features[feature_key])
        if default is None:
            return _l1_feature_default(feature_key)
    if governance_key and not l4_first:
        gov_val = l4_bool(l4, "governance", governance_key)
        if gov_val is not None:
            return gov_val
    return default if default is not None else True


def _resolve_feature_flags(profile_cfg: dict[str, Any], l4: dict[str, Any] | None) -> FeatureFlags:
    feature_map = feature_env_map()

    values: dict[str, bool] = {}
    for feature_key, env_key in feature_map.items():
        values[feature_key] = _resolve_bool(env_key, feature_key, profile_cfg, l4)

    values["plugin_version_enforcement"] = _resolve_bool(
        _EXTRA_FEATURE_ENV["plugin_version_enforcement"],
        None,
        profile_cfg,
        l4,
        default=True,
    )
    values["legacy_static_tokens"] = _resolve_bool(
        _EXTRA_FEATURE_ENV["legacy_static_tokens"],
        None,
        profile_cfg,
        l4,
        default=False,
    )

    return FeatureFlags(**values)


def _resolve_auth(profile_cfg: dict[str, Any], l4: dict[str, Any] | None) -> AuthSettings:
    legacy = _resolve_bool(
        "ML_AIR_LEGACY_STATIC_TOKENS",
        "legacy_static_tokens",
        profile_cfg,
        l4,
        default=False,
    )
    raw_ttl = os.getenv("ML_AIR_JWT_JWKS_CACHE_TTL_SECONDS", str(_DEFAULT_JWT_JWKS_TTL)).strip()
    try:
        jwt_ttl = max(30, int(raw_ttl))
    except ValueError:
        jwt_ttl = _DEFAULT_JWT_JWKS_TTL

    return AuthSettings(
        auth_tokens_json=os.getenv("ML_AIR_AUTH_TOKENS_JSON", "").strip(),
        jwt_hs256_secret=os.getenv("ML_AIR_JWT_HS256_SECRET", "").strip(),
        jwt_issuer=os.getenv("ML_AIR_JWT_ISSUER", "").strip(),
        jwt_audience=os.getenv("ML_AIR_JWT_AUDIENCE", "").strip(),
        jwt_jwks_url=os.getenv("ML_AIR_JWT_JWKS_URL", "").strip(),
        jwt_jwks_cache_ttl_seconds=jwt_ttl,
        worker_token=os.getenv("ML_AIR_WORKER_TOKEN", "").strip(),
        legacy_static_tokens=legacy,
    )


def _resolve_promotion(profile_cfg: dict[str, Any], l4: dict[str, Any] | None) -> PromotionSettings:
    l4_first = use_l4_first_policy(l4)
    if not l4_first and os.getenv("ML_AIR_PROMOTION_STAGE_ORDER") is not None:
        raw_order = os.getenv("ML_AIR_PROMOTION_STAGE_ORDER", "")
        parts = tuple(p.strip().lower() for p in raw_order.split(",") if p.strip())
        stage_order = parts if parts else _DEFAULT_PROMOTION_STAGE_ORDER
    else:
        l4_order = l4_stage_order(l4)
        stage_order = l4_order if l4_order else _DEFAULT_PROMOTION_STAGE_ORDER

    governance = l4.get("governance") if isinstance(l4, dict) else None
    approval_stages: tuple[str, ...] = ("production",)
    if isinstance(governance, dict) and governance.get("promotion_approval_stages"):
        raw_stages = governance.get("promotion_approval_stages")
        if isinstance(raw_stages, list):
            approval_stages = tuple(str(s).strip().lower() for s in raw_stages if str(s).strip())
    elif not l4_first and os.getenv("ML_AIR_PROMOTION_APPROVAL_STAGES") is not None:
        raw = str(os.getenv("ML_AIR_PROMOTION_APPROVAL_STAGES", "production")).strip()
        approval_stages = tuple(p.strip().lower() for p in raw.split(",") if p.strip()) or ("production",)

    skip_approval = _resolve_bool(
        "ML_AIR_SKIP_APPROVAL_FOR_PROMOTE",
        "skip_approval_for_promote",
        profile_cfg,
        l4,
        governance_key="skip_approval_for_promote",
        default=True,
    )

    return PromotionSettings(
        stage_order=stage_order,
        rollback_enabled=_resolve_bool(
            "ML_AIR_ROLLBACK_ENABLED",
            "rollback_enabled",
            profile_cfg,
            l4,
            governance_key="rollback_enabled",
        ),
        rollback_requires_approval=_resolve_bool(
            "ML_AIR_ROLLBACK_REQUIRES_APPROVAL",
            "rollback_requires_approval",
            profile_cfg,
            l4,
            governance_key="rollback_requires_approval",
        ),
        allow_skip_forward_stages=_resolve_bool(
            "ML_AIR_PROMOTION_ALLOW_SKIP_STAGES",
            "promotion_allow_skip_stages",
            profile_cfg,
            l4,
            governance_key="promotion_allow_skip_stages",
        ),
        skip_approval_for_promote=skip_approval,
        approval_stages=approval_stages,
    )


def _resolve_observability(profile_cfg: dict[str, Any], l4: dict[str, Any] | None) -> ObservabilitySettings:
    l4_first = use_l4_first_policy(l4)
    observability = profile_cfg.get("observability")
    profile_grafana = None
    if isinstance(observability, dict):
        profile_grafana = str(observability.get("grafana_url") or "").strip() or None

    if l4_first:
        grafana = l4_str(l4, "telemetry", "grafana_ui_url") or profile_grafana
    else:
        grafana = os.getenv("ML_AIR_GRAFANA_URL", "").strip() or l4_str(l4, "telemetry", "grafana_ui_url") or profile_grafana

    if l4_first:
        retention_days = l4_int(l4, "telemetry", "trace_span_retention_days") or _DEFAULT_TRACE_RETENTION_DAYS
    elif "ML_AIR_TRACE_SPAN_RETENTION_DAYS" in os.environ:
        raw_days = os.getenv("ML_AIR_TRACE_SPAN_RETENTION_DAYS", str(_DEFAULT_TRACE_RETENTION_DAYS)).strip()
        try:
            retention_days = int(raw_days)
        except ValueError:
            retention_days = _DEFAULT_TRACE_RETENTION_DAYS
    else:
        retention_days = l4_int(l4, "telemetry", "trace_span_retention_days") or _DEFAULT_TRACE_RETENTION_DAYS

    if l4_first:
        sample_ratio = l4_float(l4, "telemetry", "trace_sample_ratio")
        if sample_ratio is None:
            sample_ratio = _DEFAULT_TRACE_SAMPLE_RATIO
    elif "ML_AIR_OTEL_TRACE_SAMPLE_RATIO" in os.environ:
        raw_ratio = os.getenv("ML_AIR_OTEL_TRACE_SAMPLE_RATIO", str(_DEFAULT_TRACE_SAMPLE_RATIO)).strip()
        try:
            sample_ratio = float(raw_ratio)
        except ValueError:
            sample_ratio = _DEFAULT_TRACE_SAMPLE_RATIO
    else:
        sample_ratio = l4_float(l4, "telemetry", "trace_sample_ratio")
        if sample_ratio is None:
            sample_ratio = _DEFAULT_TRACE_SAMPLE_RATIO

    return ObservabilitySettings(
        grafana_url=grafana or None,
        trace_span_retention_days=retention_days,
        trace_sample_ratio=sample_ratio,
    )


def load_settings() -> Settings:
    profile_cfg = _profile_bundle()
    l4 = get_l4_overlay()
    profile = str(profile_cfg.get("profile") or os.getenv("MLAIR_PROFILE", "development"))
    environment = os.getenv(
        "ML_AIR_ENVIRONMENT",
        str(profile_cfg.get("ml_air_environment") or profile),
    ).strip()

    if use_l4_first_policy(l4):
        hub_route = l4_str(l4, "hub", "default_route") or "datasets"
    elif "ML_AIR_HUB_DEFAULT_ROUTE" in os.environ:
        hub_route = os.getenv("ML_AIR_HUB_DEFAULT_ROUTE", "datasets").strip().lower() or "datasets"
    else:
        hub_route = l4_str(l4, "hub", "default_route") or "datasets"
    if hub_route not in _HUB_ROUTES:
        hub_route = "datasets"

    features = _resolve_feature_flags(profile_cfg, l4)

    lockout_threshold = _IDENTITY_LOCKOUT_THRESHOLD
    lockout_minutes = _IDENTITY_LOCKOUT_MINUTES
    if l4:
        lockout_threshold = l4_int(l4, "identity", "lockout_threshold") or lockout_threshold
        lockout_minutes = l4_int(l4, "identity", "lockout_minutes") or lockout_minutes

    return Settings(
        profile=profile,
        environment=environment,
        default_tenant=os.getenv("ML_AIR_DEFAULT_TENANT", "default").strip() or "default",
        default_project=os.getenv("ML_AIR_DEFAULT_PROJECT", "default_project").strip() or "default_project",
        hub_default_route=hub_route,
        features=features,
        auth=_resolve_auth(profile_cfg, l4),
        identity=IdentitySettings(
            lockout_threshold=lockout_threshold,
            lockout_minutes=lockout_minutes,
        ),
        promotion=_resolve_promotion(profile_cfg, l4),
        observability=_resolve_observability(profile_cfg, l4),
    )
