"""Unit tests for PolicyEngine (P1)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.configuration.types import EffectiveConfiguration, ResolutionContext
from app.domains.policy.policy_engine import PolicyEngine
from app.domains.policy.types import PolicyRule


class _FakePolicyRepo:
    def list_rules(self, **kwargs):  # noqa: ANN003
        return [
            PolicyRule(
                rule_id="r1",
                tenant_id="t1",
                project_id="p1",
                resource_type="model",
                resource_id="m1",
                rule_kind="drift_threshold",
                config={"resource_id": "m1"},
            )
        ]


class _FakeResolver:
    def resolve(self, key: str, *, context: ResolutionContext) -> EffectiveConfiguration:
        values = {
            "monitoring.drift.enabled": True,
            "monitoring.drift.threshold": 0.2,
            "automation.retrain.enabled": False,
            "automation.rollback.enabled": False,
            "automation.retrain.trigger_mode": "manual",
        }
        from app.domains.configuration.types import ConfigurationSource

        return EffectiveConfiguration(
            key=key,
            value=values.get(key, False),
            value_type="boolean" if isinstance(values.get(key), bool) else "number",
            source=ConfigurationSource(scope_level="global"),
            inherited=True,
            chain=[],
            resolved_at="now",
        )


class TestPolicyEngine(unittest.TestCase):
    def test_drift_action_when_psi_exceeds_threshold(self) -> None:
        engine = PolicyEngine(repository=_FakePolicyRepo(), resolver=_FakeResolver())  # type: ignore[arg-type]
        result = engine.evaluate(
            tenant_id="t1",
            project_id="p1",
            resource_id="m1",
            telemetry={"drift": {"psi": 0.35}},
        )
        types = [a.action_type for a in result.actions]
        self.assertIn("DriftDetected", types)

    def test_no_drift_action_below_threshold(self) -> None:
        engine = PolicyEngine(repository=_FakePolicyRepo(), resolver=_FakeResolver())  # type: ignore[arg-type]
        result = engine.evaluate(
            tenant_id="t1",
            project_id="p1",
            resource_id="m1",
            telemetry={"drift": {"psi": 0.1}},
        )
        self.assertEqual(result.actions, [])


if __name__ == "__main__":
    unittest.main()
