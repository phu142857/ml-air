"""Formal lifecycle FSM guards (P1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.domains.configuration.configuration_resolver import ConfigurationResolver
from app.domains.configuration.types import ResolutionContext
from app.domains.governance import promotion_policy

TransitionKind = Literal["forward", "rollback", "noop", "unknown"]


@dataclass(frozen=True)
class LifecycleTransitionDecision:
    allowed: bool
    error_code: str | None
    message: str | None
    transition_kind: TransitionKind


class LifecycleFSM:
    """Wraps stage transition policy and configuration-backed governance guards."""

    def __init__(self, *, resolver: ConfigurationResolver | None = None) -> None:
        self._resolver = resolver or ConfigurationResolver()

    def evaluate_stage_transition(
        self,
        *,
        tenant_id: str,
        project_id: str,
        current_stage: str | None,
        target_stage: str,
        has_passing_evaluation: bool = True,
        resource_id: str | None = None,
    ) -> LifecycleTransitionDecision:
        allowed, code, message, kind = promotion_policy.evaluate_stage_transition(
            current_stage=current_stage,
            target_stage=target_stage,
        )
        if not allowed:
            return LifecycleTransitionDecision(
                allowed=False,
                error_code=code,
                message=message,
                transition_kind=kind,  # type: ignore[arg-type]
            )

        context = ResolutionContext(
            tenant_id=tenant_id,
            project_id=project_id,
            resource_type="model" if resource_id else None,
            resource_id=resource_id,
        )
        require_eval = bool(
            self._resolver.resolve("governance.evaluation.require_before_promote", context=context).value
        )
        two_step = bool(
            self._resolver.resolve("governance.approval.two_step_required", context=context).value
        )

        target = (target_stage or "").strip().lower()
        if require_eval and target == "production" and not has_passing_evaluation:
            return LifecycleTransitionDecision(
                allowed=False,
                error_code="evaluation_required",
                message="Production promotion requires a passing evaluation.",
                transition_kind=kind,  # type: ignore[arg-type]
            )

        if two_step and target == "production":
            # FSM records guard; approval workflow enforces approver chain separately.
            pass

        return LifecycleTransitionDecision(
            allowed=True,
            error_code=None,
            message=None,
            transition_kind=kind,  # type: ignore[arg-type]
        )
