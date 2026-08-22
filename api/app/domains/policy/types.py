"""Policy engine domain types (P1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

RuleKind = Literal["drift_threshold", "slo_breach", "retrain_on_breach", "rollback_on_breach"]


@dataclass(frozen=True)
class PolicyRule:
    rule_id: str
    tenant_id: str
    project_id: str
    resource_type: str
    resource_id: str | None
    rule_kind: RuleKind
    config: dict[str, Any]
    enabled: bool = True


@dataclass
class PolicyAction:
    action_type: str
    severity: str = "info"
    reason: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PolicyEvaluationResult:
    actions: list[PolicyAction]
    evaluated_rules: int
    skipped_rules: int = 0
    configuration: dict[str, Any] = field(default_factory=dict)
