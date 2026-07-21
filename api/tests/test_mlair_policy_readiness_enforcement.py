"""MLair training-policy readiness enforcement (lifecycle gate, not pipeline execution gate)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.lifecycle.readiness_service import (
    ReadinessEligibilityBlocked,
    require_dataset_training_eligibility,
    resolve_training_policy_id,
)


class MlairPolicyReadinessEnforcementTests(unittest.TestCase):
    @patch("app.domains.lifecycle.readiness_service.list_dataset_training_policies")
    def test_resolve_policy_prefers_model_bound(self, mock_list):
        mock_list.return_value = [
            {"policy_id": "p-generic", "model_id": None},
            {"policy_id": "p-model", "model_id": "m-1"},
        ]
        pid = resolve_training_policy_id(
            tenant_id="t",
            project_id="p",
            dataset_id="d",
            model_id="m-1",
        )
        self.assertEqual(pid, "p-model")

    @patch("app.domains.lifecycle.readiness_service.list_dataset_training_policies")
    def test_resolve_policy_requires_at_least_one(self, mock_list):
        mock_list.return_value = []
        with self.assertRaises(ValueError) as ctx:
            resolve_training_policy_id(tenant_id="t", project_id="p", dataset_id="d")
        self.assertEqual(str(ctx.exception), "dataset_training_policy_required")

    @patch("app.domains.lifecycle.readiness_service.evaluate_dataset_readiness")
    @patch("app.domains.lifecycle.readiness_service.resolve_training_policy_id")
    def test_require_blocks_when_not_ready(self, mock_resolve, mock_eval):
        mock_resolve.return_value = "pol-1"
        mock_eval.return_value = {
            "ready": False,
            "eligibility_criteria": [{"code": "approval", "status": "fail"}],
        }
        with self.assertRaises(ReadinessEligibilityBlocked):
            require_dataset_training_eligibility(
                tenant_id="t",
                project_id="p",
                dataset_id="d",
                dataset_version_id="v-1",
                model_id="m-1",
            )

    @patch("app.domains.lifecycle.readiness_service.evaluate_dataset_readiness")
    @patch("app.domains.lifecycle.readiness_service.resolve_training_policy_id")
    def test_require_passes_when_ready(self, mock_resolve, mock_eval):
        mock_resolve.return_value = "pol-1"
        mock_eval.return_value = {"ready": True, "policy_id": "pol-1"}
        out = require_dataset_training_eligibility(
            tenant_id="t",
            project_id="p",
            dataset_id="d",
            dataset_version_id="v-1",
        )
        self.assertTrue(out["ready"])


if __name__ == "__main__":
    unittest.main()
