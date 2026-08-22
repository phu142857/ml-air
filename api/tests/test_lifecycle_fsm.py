"""Unit tests for LifecycleFSM (P1)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.configuration.types import EffectiveConfiguration, ResolutionContext
from app.domains.lifecycle.lifecycle_fsm import LifecycleFSM


class _FakeResolver:
    def resolve(self, key: str, *, context: ResolutionContext) -> EffectiveConfiguration:
        from app.domains.configuration.types import ConfigurationSource

        value = key == "governance.evaluation.require_before_promote"
        return EffectiveConfiguration(
            key=key,
            value=value,
            value_type="boolean",
            source=ConfigurationSource(scope_level="project"),
            inherited=False,
            chain=[],
            resolved_at="now",
        )


class TestLifecycleFSM(unittest.TestCase):
    @patch("app.domains.lifecycle.lifecycle_fsm.promotion_policy.evaluate_stage_transition")
    def test_blocks_production_without_evaluation(self, mock_stage) -> None:
        mock_stage.return_value = (True, None, None, "forward")
        fsm = LifecycleFSM(resolver=_FakeResolver())  # type: ignore[arg-type]
        decision = fsm.evaluate_stage_transition(
            tenant_id="t1",
            project_id="p1",
            current_stage="staging",
            target_stage="production",
            has_passing_evaluation=False,
            resource_id="m1",
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.error_code, "evaluation_required")


if __name__ == "__main__":
    unittest.main()
