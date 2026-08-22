"""Registered configuration keys, types, defaults, and allowed scopes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.domains.configuration.types import ScopeLevel, ValueType

SCOPE_ORDER: tuple[ScopeLevel, ...] = ("global", "project", "environment", "resource")


@dataclass(frozen=True)
class KeySpec:
    key: str
    value_type: ValueType
    default: Any
    allowed_scopes: frozenset[ScopeLevel]
    description: str = ""
    label: str = ""


_REGISTRY: dict[str, KeySpec] = {
    "mlops.experiment.enabled": KeySpec(
        key="mlops.experiment.enabled",
        value_type="boolean",
        default=False,
        allowed_scopes=frozenset({"global", "project"}),
        label="Experiment management",
        description="Enable lightweight experiment grouping in Hub (MLflow remains source of truth for tracking).",
    ),
    "monitoring.drift.enabled": KeySpec(
        key="monitoring.drift.enabled",
        value_type="boolean",
        default=False,
        allowed_scopes=frozenset({"global", "project", "environment", "resource"}),
        label="Drift monitoring",
        description="Enable drift monitoring for this scope.",
    ),
    "monitoring.drift.threshold": KeySpec(
        key="monitoring.drift.threshold",
        value_type="number",
        default=0.2,
        allowed_scopes=frozenset({"global", "project", "environment", "resource"}),
        label="Drift threshold (PSI)",
        description="Population Stability Index threshold for drift detection.",
    ),
    "monitoring.drift.method": KeySpec(
        key="monitoring.drift.method",
        value_type="string",
        default="psi",
        allowed_scopes=frozenset({"global", "project"}),
        label="Drift method",
        description="Drift detection method identifier.",
    ),
    "monitoring.slo.check_interval": KeySpec(
        key="monitoring.slo.check_interval",
        value_type="duration",
        default="15m",
        allowed_scopes=frozenset({"global", "project", "resource"}),
        label="SLO check interval",
        description="How often SLO rules are evaluated.",
    ),
    "automation.retrain.enabled": KeySpec(
        key="automation.retrain.enabled",
        value_type="boolean",
        default=False,
        allowed_scopes=frozenset({"global", "project", "environment", "resource"}),
        label="Auto retrain",
        description="Allow automated retraining when policy conditions are met.",
    ),
    "automation.retrain.trigger_mode": KeySpec(
        key="automation.retrain.trigger_mode",
        value_type="string",
        default="manual",
        allowed_scopes=frozenset({"resource"}),
        label="Retrain trigger mode",
        description="How retraining is triggered (manual, drift, slo_breach, auto_ready, schedule).",
    ),
    "automation.retrain.debounce_minutes": KeySpec(
        key="automation.retrain.debounce_minutes",
        value_type="number",
        default=10,
        allowed_scopes=frozenset({"resource"}),
        label="Retrain debounce (minutes)",
        description="Minimum minutes between automated retrain attempts.",
    ),
    "automation.retrain.schedule_cron": KeySpec(
        key="automation.retrain.schedule_cron",
        value_type="string",
        default="0 */6 * * *",
        allowed_scopes=frozenset({"resource"}),
        label="Retrain schedule (cron)",
        description="Cron expression when trigger_mode is schedule.",
    ),
    "automation.deploy.enabled": KeySpec(
        key="automation.deploy.enabled",
        value_type="boolean",
        default=False,
        allowed_scopes=frozenset({"global", "project", "environment", "resource"}),
        label="Auto deploy",
        description="Allow automated deployment when policy conditions are met.",
    ),
    "automation.rollback.enabled": KeySpec(
        key="automation.rollback.enabled",
        value_type="boolean",
        default=False,
        allowed_scopes=frozenset({"global", "project", "environment", "resource"}),
        label="Auto rollback",
        description="Allow automated rollback when policy conditions are met.",
    ),
    "governance.approval.two_step_required": KeySpec(
        key="governance.approval.two_step_required",
        value_type="boolean",
        default=True,
        allowed_scopes=frozenset({"global", "project"}),
        label="Two-step approval",
        description="Require reviewer then approver when stakeholders exist.",
    ),
    "governance.evaluation.require_before_promote": KeySpec(
        key="governance.evaluation.require_before_promote",
        value_type="boolean",
        default=True,
        allowed_scopes=frozenset({"global", "project"}),
        label="Evaluation before promote",
        description="Block production promotion without a passing evaluation.",
    ),
}


def get_key_spec(key: str) -> KeySpec:
    spec = _REGISTRY.get(key)
    if not spec:
        raise ValueError("key_not_registered")
    return spec


def list_key_specs(*, prefix: str | None = None) -> list[KeySpec]:
    items = list(_REGISTRY.values())
    if prefix:
        items = [s for s in items if s.key.startswith(prefix)]
    return sorted(items, key=lambda s: s.key)


def coerce_value(value: Any, value_type: ValueType) -> Any:
    if value is None:
        return None
    if value_type == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
        raise ValueError("invalid_boolean_value")
    if value_type == "number":
        return float(value)
    if value_type == "string":
        return str(value)
    if value_type == "duration":
        return str(value)
    if value_type == "json":
        if isinstance(value, (dict, list)):
            return value
        raise ValueError("invalid_json_value")
    raise ValueError("invalid_value_type")


def validate_scope_for_key(key: str, scope_level: ScopeLevel) -> None:
    spec = get_key_spec(key)
    if scope_level not in spec.allowed_scopes:
        raise ValueError("scope_not_allowed_for_key")
