"""Policy evaluation — actions from rules + resolved configuration (P1)."""

from __future__ import annotations

from typing import Any

from app.domains.configuration.configuration_resolver import ConfigurationResolver
from app.domains.configuration.types import ResolutionContext
from app.domains.policy.policy_repository import PolicyRepository
from app.domains.policy.types import PolicyAction, PolicyEvaluationResult, PolicyRule


class PolicyEngine:
    def __init__(
        self,
        *,
        repository: PolicyRepository | None = None,
        resolver: ConfigurationResolver | None = None,
    ) -> None:
        self._repository = repository or PolicyRepository()
        self._resolver = resolver or ConfigurationResolver()
        self._config_snapshot: dict[str, Any] = {}

    def evaluate(
        self,
        *,
        tenant_id: str,
        project_id: str,
        resource_type: str = "model",
        resource_id: str | None = None,
        telemetry: dict[str, Any] | None = None,
    ) -> PolicyEvaluationResult:
        telemetry = telemetry or {}
        self._config_snapshot = {}
        context = ResolutionContext(
            tenant_id=tenant_id,
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        rules = self._repository.list_rules(
            tenant_id=tenant_id,
            project_id=project_id,
            resource_type=resource_type,
        )
        applicable = [
            r
            for r in rules
            if not r.config.get("resource_id") or r.config.get("resource_id") == resource_id
        ]
        actions: list[PolicyAction] = []
        skipped = 0

        for rule in applicable:
            if not rule.enabled:
                skipped += 1
                continue
            handler = _RULE_HANDLERS.get(rule.rule_kind)
            if not handler:
                skipped += 1
                continue
            actions.extend(handler(self, rule=rule, context=context, telemetry=telemetry))

        return PolicyEvaluationResult(
            actions=actions,
            evaluated_rules=len(applicable),
            skipped_rules=skipped,
            configuration=dict(self._config_snapshot),
        )

    def _resolve_bool(self, key: str, *, context: ResolutionContext) -> bool:
        effective = self._resolver.resolve(key, context=context)
        self._config_snapshot[key] = effective.value
        return bool(effective.value)

    def _resolve_number(self, key: str, *, context: ResolutionContext) -> float:
        effective = self._resolver.resolve(key, context=context)
        self._config_snapshot[key] = effective.value
        return float(effective.value or 0)


def _eval_drift(
    engine: PolicyEngine,
    *,
    rule: PolicyRule,
    context: ResolutionContext,
    telemetry: dict[str, Any],
) -> list[PolicyAction]:
    if not engine._resolve_bool("monitoring.drift.enabled", context=context):
        return []
    threshold = engine._resolve_number("monitoring.drift.threshold", context=context)
    drift = telemetry.get("drift") or {}
    psi = float(drift.get("psi") or telemetry.get("drift_psi") or 0)
    if psi <= threshold:
        return []
    return [
        PolicyAction(
            action_type="DriftDetected",
            severity="warning",
            reason=f"PSI {psi:.4f} exceeds threshold {threshold}",
            metadata={"psi": psi, "threshold": threshold, "rule_id": rule.rule_id},
        )
    ]


def _eval_slo(
    engine: PolicyEngine,
    *,
    rule: PolicyRule,
    context: ResolutionContext,
    telemetry: dict[str, Any],
) -> list[PolicyAction]:
    breaches = telemetry.get("slo_breaches") or telemetry.get("breaches") or []
    if not breaches:
        return []
    return [
        PolicyAction(
            action_type="SloBreached",
            severity="warning",
            reason="SLO rule breach detected",
            metadata={"breaches": breaches, "rule_id": rule.rule_id},
        )
    ]


def _eval_retrain(
    engine: PolicyEngine,
    *,
    rule: PolicyRule,
    context: ResolutionContext,
    telemetry: dict[str, Any],
) -> list[PolicyAction]:
    if not engine._resolve_bool("automation.retrain.enabled", context=context):
        return []
    trigger = str(
        engine._resolver.resolve("automation.retrain.trigger_mode", context=context).value or "manual"
    )
    engine._config_snapshot["automation.retrain.trigger_mode"] = trigger
    reason = str(telemetry.get("reason") or "")
    if trigger == "manual" and not reason:
        return []
    if trigger not in {"drift", "slo_breach", "auto_ready", "schedule"} and not reason:
        return []
    return [
        PolicyAction(
            action_type="RetrainingRequested",
            severity="info",
            reason=reason or f"trigger_mode={trigger}",
            metadata={"trigger_mode": trigger, "rule_id": rule.rule_id},
        )
    ]


def _eval_rollback(
    engine: PolicyEngine,
    *,
    rule: PolicyRule,
    context: ResolutionContext,
    telemetry: dict[str, Any],
) -> list[PolicyAction]:
    if not engine._resolve_bool("automation.rollback.enabled", context=context):
        return []
    breaches = telemetry.get("slo_breaches") or telemetry.get("breaches") or []
    if not breaches:
        return []
    return [
        PolicyAction(
            action_type="RollbackRequested",
            severity="warning",
            reason="SLO breach with rollback automation enabled",
            metadata={"rule_id": rule.rule_id},
        )
    ]


_RULE_HANDLERS = {
    "drift_threshold": _eval_drift,
    "slo_breach": _eval_slo,
    "retrain_on_breach": _eval_retrain,
    "rollback_on_breach": _eval_rollback,
}
