"""L4 platform policy reads for L5 tenant services (Package 002 Phase 5)."""

from __future__ import annotations

import os
from typing import Any

from app.settings.l4_overlay import get_l4_overlay
from app.settings.policy_env import use_l4_first_policy

_L1_QUOTA_DEFAULTS: dict[str, int] = {
    "max_projects": 200,
    "max_datasets_per_project": 500,
    "max_models_per_project": 200,
    "max_runs_per_project": 50_000,
    "max_webhook_subscriptions_per_project": 50,
    "max_parallel_tasks": 1000,
}

_QUOTA_ENV_MAP: dict[str, str] = {
    "max_projects": "ML_AIR_TENANT_QUOTA_MAX_PROJECTS",
    "max_datasets_per_project": "ML_AIR_TENANT_QUOTA_MAX_DATASETS_PER_PROJECT",
    "max_models_per_project": "ML_AIR_TENANT_QUOTA_MAX_MODELS_PER_PROJECT",
    "max_runs_per_project": "ML_AIR_TENANT_QUOTA_MAX_RUNS_PER_PROJECT",
    "max_webhook_subscriptions_per_project": "ML_AIR_TENANT_QUOTA_MAX_WEBHOOK_SUBSCRIPTIONS_PER_PROJECT",
    "max_parallel_tasks": "ML_AIR_TENANT_QUOTA_DEFAULT_MAX_PARALLEL_TASKS",
}


def _positive_int(raw: Any, *, fallback: int) -> int:
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return fallback


def _env_limit_optional(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return max(1, int(raw))
    except ValueError:
        return None


def _normalize_hosts(hosts: Any) -> list[str]:
    if hosts is None:
        return []
    if isinstance(hosts, str):
        parts = [p.strip() for p in hosts.split(",")]
    elif isinstance(hosts, list):
        parts = [str(p).strip() for p in hosts]
    else:
        return []
    return sorted({p.lower() for p in parts if p})


def _l4_governance(l4: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(l4, dict):
        return None
    governance = l4.get("governance")
    return governance if isinstance(governance, dict) else None


def _quota_from_l4(l4: dict[str, Any] | None) -> dict[str, int] | None:
    governance = _l4_governance(l4)
    if not governance or "quota_defaults" not in governance:
        return None
    raw = governance.get("quota_defaults")
    if not isinstance(raw, dict):
        return None
    out: dict[str, int] = {}
    for key, fallback in _L1_QUOTA_DEFAULTS.items():
        if key in raw and raw[key] is not None:
            out[key] = _positive_int(raw[key], fallback=fallback)
    return out


def _quota_from_env() -> dict[str, int]:
    out: dict[str, int] = {}
    for key, env_name in _QUOTA_ENV_MAP.items():
        val = _env_limit_optional(env_name)
        if val is not None:
            out[key] = val
    return out


def platform_quota_limits() -> dict[str, int]:
    """Default tenant quota ceilings (L4 → env alias → L1)."""
    l4 = get_l4_overlay()
    limits = dict(_L1_QUOTA_DEFAULTS)

    l4_limits = _quota_from_l4(l4)
    if l4_limits:
        limits.update(l4_limits)

    if not use_l4_first_policy(l4):
        limits.update(_quota_from_env())
    elif not l4_limits:
        limits.update(_quota_from_env())

    return limits


def _hosts_from_env() -> list[str]:
    raw = os.getenv("ML_AIR_WEBHOOK_ALLOWED_HOSTS", "").strip()
    if not raw:
        return []
    return _normalize_hosts(raw.split(","))


def _hosts_from_l4(l4: dict[str, Any] | None) -> list[str] | None:
    governance = _l4_governance(l4)
    if not governance or "webhook_allowed_hosts" not in governance:
        return None
    return _normalize_hosts(governance.get("webhook_allowed_hosts"))


def platform_webhook_allowed_hosts() -> list[str]:
    """Global webhook hostname allowlist (L4 → env alias)."""
    l4 = get_l4_overlay()
    l4_hosts = _hosts_from_l4(l4)

    if use_l4_first_policy(l4):
        if l4_hosts is not None:
            return l4_hosts
        return _hosts_from_env()

    env_hosts = _hosts_from_env()
    if env_hosts:
        return env_hosts
    if l4_hosts is not None:
        return l4_hosts
    return []
