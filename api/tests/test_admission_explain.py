"""Unit tests for composable admission explain + trigger preview."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import app.domains.governance.trigger_policy_service as trigger_policy_service
from app.domains.governance.admission_decision import REJECT, build_resource_state
from app.domains.governance.admission_explain_service import explain_run_admission, preview_trigger_policy

_IDLE_STATE = build_resource_state(capacity={"cpu": 8, "memory_mb": 8192, "gpu": 0, "tasks": 32})


class TestAdmissionExplain(unittest.TestCase):
    def setUp(self) -> None:
        snap = patch(
            "app.domains.governance.admission_decision.snapshot_resource_state",
            return_value=_IDLE_STATE,
        )
        enf = patch(
            "app.domains.governance.tenant_quota_service.enforcement_enabled",
            return_value=False,
        )
        self.addCleanup(snap.stop)
        self.addCleanup(enf.stop)
        snap.start()
        enf.start()

    def test_explain_admitted_when_no_gates(self) -> None:
        with (
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_quotas",
                return_value={"max_runs": 100},
            ),
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_usage",
                return_value={"runs": 1},
            ),
        ):
            out = explain_run_admission(tenant_id="t1", project_id="p1")
        self.assertTrue(out["admitted"])
        self.assertEqual(out["decision"], "ACCEPT")
        self.assertFalse(out["blocking"])
        self.assertIn("resource_state", out)
        self.assertTrue(any(c["layer"] == "tenant_quota" for c in out["checks"]))
        self.assertTrue(any(c["layer"] == "resource_state" for c in out["checks"]))

    def test_explain_blocks_on_pipeline_inputs(self) -> None:
        with (
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_quotas",
                return_value={},
            ),
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_usage",
                return_value={},
            ),
            patch(
                "app.domains.orchestration.pipeline_version_service.get_latest_version_id",
                return_value="pv1",
            ),
            patch(
                "app.domains.orchestration.pipeline_version_service.get_pipeline_version",
                return_value={"config": {"inputs": [{"dataset": "ds", "required_size": 10}]}},
            ),
            patch(
                "app.domains.lifecycle.readiness_service.evaluate_pipeline_inputs_readiness",
                return_value={"ready": False, "blocking_datasets": [{"dataset": "ds"}]},
            ),
        ):
            out = explain_run_admission(
                tenant_id="t1",
                project_id="p1",
                pipeline_id="pipe-1",
            )
        self.assertFalse(out["admitted"])
        self.assertEqual(out["decision"], "REJECT")
        layer = next(c for c in out["checks"] if c["layer"] == "pipeline_inputs")
        self.assertFalse(layer["ok"])
        self.assertEqual(layer["code"], "PIPELINE_INPUTS_NOT_READY")

    def test_explain_blocks_on_promotion(self) -> None:
        with (
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_quotas",
                return_value={},
            ),
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_usage",
                return_value={},
            ),
            patch(
                "app.domains.governance.model_registry_service.evaluate_promotion_eligibility",
                return_value={
                    "eligible": False,
                    "reasons": [{"code": "approval_pending", "canonical_code": "GOVERNANCE_BLOCKED"}],
                },
            ),
        ):
            out = explain_run_admission(
                tenant_id="t1",
                project_id="p1",
                model_id="m1",
                version=2,
                target_stage="production",
            )
        self.assertFalse(out["admitted"])
        self.assertEqual(out["decision"], "REJECT")
        layer = next(c for c in out["checks"] if c["layer"] == "promotion")
        self.assertEqual(layer["code"], "GOVERNANCE_BLOCKED")

    def test_explain_gpu_never_fits_is_reject(self) -> None:
        with (
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_quotas",
                return_value={},
            ),
            patch(
                "app.domains.governance.tenant_quota_service.get_tenant_usage",
                return_value={},
            ),
        ):
            out = explain_run_admission(tenant_id="t1", project_id="p1", resources={"gpu": 1})
        self.assertFalse(out["admitted"])
        self.assertEqual(out["decision"], REJECT)
        self.assertEqual(out["reason"], "RESOURCE_CAPACITY")

    def test_preview_manual_mode(self) -> None:
        with (
            patch.object(
                trigger_policy_service,
                "get_trigger_policy",
                return_value={
                    "trigger_mode": "manual",
                    "dataset_version_id": None,
                    "last_skip_reason": None,
                },
            ),
            patch(
                "app.domains.governance.model_registry_service.resolve_model_pipeline",
                return_value={"pipeline_id": "pipe-1"},
            ),
        ):
            out = preview_trigger_policy(tenant_id="t1", project_id="p1", model_id="m1")
        self.assertTrue(out["dry_run"])
        self.assertFalse(out["would_trigger"])
        self.assertEqual(out["skip_reason"], "manual_mode")

    def test_preview_auto_ready_uses_admission(self) -> None:
        with (
            patch.object(
                trigger_policy_service,
                "get_trigger_policy",
                return_value={
                    "trigger_mode": "auto_ready",
                    "dataset_version_id": "dv1",
                    "last_skip_reason": None,
                },
            ),
            patch(
                "app.domains.governance.model_registry_service.resolve_model_pipeline",
                return_value={"pipeline_id": "pipe-1"},
            ),
            patch(
                "app.domains.governance.admission_explain_service.explain_run_admission",
                return_value={"admitted": True, "blocking": False, "checks": []},
            ) as explain,
        ):
            out = preview_trigger_policy(tenant_id="t1", project_id="p1", model_id="m1")
        self.assertTrue(out["would_trigger"])
        explain.assert_called_once()


if __name__ == "__main__":
    unittest.main()
