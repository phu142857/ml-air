"""Read adapters for legacy per-model configuration stores (dual-read transition)."""

from __future__ import annotations

from typing import Any

from app.domains.configuration.types import ResolutionContext, ScopeLevel


_CLOSED_LOOP_KEY_MAP: dict[str, str] = {
    "monitoring.drift.threshold": "drift_psi_threshold",
    "monitoring.drift.enabled": "monitoring_enabled",
    "automation.retrain.enabled": "auto_retrain_on_breach",
    "automation.deploy.enabled": "auto_promote_on_eval_pass",
    "automation.rollback.enabled": "auto_rollback_on_breach",
}

_TRIGGER_POLICY_KEY_MAP: dict[str, str] = {
    "automation.retrain.trigger_mode": "trigger_mode",
    "automation.retrain.debounce_minutes": "debounce_minutes",
    "automation.retrain.schedule_cron": "schedule_cron",
}


def get_legacy_value(
    key: str,
    *,
    context: ResolutionContext,
    scope_level: ScopeLevel,
) -> Any | None:
    if scope_level != "resource":
        return None
    if context.resource_type != "model" or not context.resource_id:
        return None
    if not context.tenant_id or not context.project_id:
        return None

    closed_loop_field = _CLOSED_LOOP_KEY_MAP.get(key)
    if closed_loop_field:
        from app.domains.governance import closed_loop_service

        policy = closed_loop_service.get_closed_loop_policy(
            context.tenant_id,
            context.project_id,
            context.resource_id,
        )
        if closed_loop_field not in policy:
            return None
        return policy[closed_loop_field]

    trigger_field = _TRIGGER_POLICY_KEY_MAP.get(key)
    if trigger_field:
        from app.domains.governance import trigger_policy_service

        policy = trigger_policy_service.get_trigger_policy(
            context.tenant_id,
            context.project_id,
            context.resource_id,
        )
        if trigger_field not in policy:
            return None
        return policy[trigger_field]

    return None
