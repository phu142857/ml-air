"""Unit tests for Phase III closed-loop MLOps."""

from __future__ import annotations

import unittest

from app.domains.governance.slo_service import _compare
from app.domains.governance.agent_integration_service import get_lifecycle_recommendations


class TestSloCompare(unittest.TestCase):
    def test_gt_breach(self) -> None:
        self.assertTrue(_compare(0.9, "gt", 0.8))
        self.assertFalse(_compare(0.7, "gt", 0.8))

    def test_lt_breach(self) -> None:
        self.assertTrue(_compare(0.7, "lt", 0.8))
        self.assertFalse(_compare(0.9, "lt", 0.8))


class TestAgentIntegrationStub(unittest.TestCase):
    def test_recommendations_shape(self) -> None:
        out = get_lifecycle_recommendations(
            tenant_id="default",
            project_id="default_project",
            model_id=None,
        )
        self.assertEqual(out["interface"], "agent_integration_v1")
        self.assertEqual(out["agent_implementation"], "rule_based_stub")
        self.assertIn("recommendations", out)


if __name__ == "__main__":
    unittest.main()
