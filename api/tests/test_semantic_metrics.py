"""Unit tests for semantic_metrics helpers (no DB)."""

import unittest

from app.services import semantic_metrics as sm


class TestSemanticMetricsHelpers(unittest.TestCase):
    def test_normalize_audit_source(self) -> None:
        self.assertEqual(sm.normalize_audit_source("manual"), "manual")
        self.assertEqual(sm.normalize_audit_source("SCHEDULER"), "scheduler")
        self.assertEqual(sm.normalize_audit_source(None), "manual")
        self.assertEqual(sm.normalize_audit_source("unknown-source-xyz"), "other")

    def test_primary_eligibility_denial_reason_from_reasons(self) -> None:
        r = {"ready": False, "reasons": [{"code": "size_threshold", "message": "too small"}]}
        self.assertEqual(sm.primary_eligibility_denial_reason(r), "size_threshold")

    def test_primary_eligibility_denial_reason_unknown_code_buckets_other(self) -> None:
        r = {"ready": False, "reasons": [{"code": "custom_xyz", "message": "x"}]}
        self.assertEqual(sm.primary_eligibility_denial_reason(r), "other")

    def test_primary_eligibility_denial_reason_from_criteria(self) -> None:
        r = {
            "ready": False,
            "reasons": [],
            "eligibility_criteria": [
                {"code": "freshness", "label": "Freshness", "status": "fail"},
            ],
        }
        self.assertEqual(sm.primary_eligibility_denial_reason(r), "freshness")

    def test_primary_eligibility_denial_reason_empty(self) -> None:
        self.assertEqual(sm.primary_eligibility_denial_reason({"ready": False}), "unknown")


if __name__ == "__main__":
    unittest.main()
