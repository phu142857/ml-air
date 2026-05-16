"""Unit tests for model promotion eligibility (deployment gate)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.domains.governance.model_registry_service import (
    APPROVAL_APPROVED,
    APPROVAL_PENDING,
    APPROVAL_REJECTED,
    compute_promotion_eligibility,
)


class TestPromotionEligibility(unittest.TestCase):
    def test_production_requires_approved(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SKIP_APPROVAL_FOR_PROMOTE": "0"}, clear=False):
            out = compute_promotion_eligibility(
                model_id="m1",
                version=2,
                target_stage="production",
                current_stage="staging",
                approval_status=APPROVAL_PENDING,
                artifact_uri="s3://bucket/model",
            )
        self.assertFalse(out["eligible"])
        self.assertTrue(out["requires_approval"])
        self.assertEqual(out["reasons"][0]["code"], "approval_pending")
        self.assertEqual(out["reasons"][0]["canonical_code"], "GOVERNANCE_BLOCKED")

    def test_production_allowed_when_approved(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SKIP_APPROVAL_FOR_PROMOTE": "0"}, clear=False):
            out = compute_promotion_eligibility(
                model_id="m1",
                version=2,
                target_stage="production",
                current_stage="staging",
                approval_status=APPROVAL_APPROVED,
                artifact_uri=None,
            )
        self.assertTrue(out["eligible"])
        self.assertEqual(out["reasons"], [])

    def test_skip_approval_env(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SKIP_APPROVAL_FOR_PROMOTE": "1"}, clear=False):
            out = compute_promotion_eligibility(
                model_id="m1",
                version=1,
                target_stage="production",
                current_stage="staging",
                approval_status=APPROVAL_PENDING,
                artifact_uri=None,
            )
        self.assertTrue(out["eligible"])
        self.assertFalse(out["requires_approval"])
        self.assertTrue(out["approval_gate_skipped"])

    def test_already_at_stage(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SKIP_APPROVAL_FOR_PROMOTE": "1"}, clear=False):
            out = compute_promotion_eligibility(
                model_id="m1",
                version=1,
                target_stage="production",
                current_stage="production",
                approval_status=APPROVAL_APPROVED,
                artifact_uri="uri",
            )
        self.assertFalse(out["eligible"])
        self.assertEqual(out["reasons"][0]["code"], "already_at_stage")

    def test_rejected_approval(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SKIP_APPROVAL_FOR_PROMOTE": "0"}, clear=False):
            out = compute_promotion_eligibility(
                model_id="m1",
                version=1,
                target_stage="production",
                current_stage="staging",
                approval_status=APPROVAL_REJECTED,
                artifact_uri=None,
            )
        self.assertFalse(out["eligible"])
        self.assertEqual(out["reasons"][-1]["code"], "approval_rejected")

    def test_staging_promote_without_approval_when_only_production_gated(self) -> None:
        with patch.dict(
            os.environ,
            {"ML_AIR_SKIP_APPROVAL_FOR_PROMOTE": "0", "ML_AIR_PROMOTION_APPROVAL_STAGES": "production"},
            clear=False,
        ):
            out = compute_promotion_eligibility(
                model_id="m1",
                version=1,
                target_stage="staging",
                current_stage=None,
                approval_status=APPROVAL_PENDING,
                artifact_uri=None,
            )
        self.assertTrue(out["eligible"])
        self.assertFalse(out["requires_approval"])


if __name__ == "__main__":
    unittest.main()
