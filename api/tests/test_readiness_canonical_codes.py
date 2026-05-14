"""Unit tests for readiness canonical reason code mapping."""

from __future__ import annotations

import unittest

from app.services.readiness_canonical_codes import (
    attach_canonical_to_reason_row,
    canonical_readiness_code,
    metric_label_for_canonical,
)


class TestReadinessCanonicalCodes(unittest.TestCase):
    def test_size_threshold_maps(self) -> None:
        self.assertEqual(canonical_readiness_code("size_threshold"), "THRESHOLD_NOT_MET")
        self.assertEqual(metric_label_for_canonical("THRESHOLD_NOT_MET"), "threshold_not_met")

    def test_unknown_internal_maps_to_unknown_metric_other(self) -> None:
        self.assertEqual(canonical_readiness_code("custom_xyz"), "UNKNOWN_READINESS_REASON")
        self.assertEqual(metric_label_for_canonical("UNKNOWN_READINESS_REASON"), "other")

    def test_attach_canonical(self) -> None:
        row = attach_canonical_to_reason_row({"code": "approval", "message": "blocked"})
        self.assertEqual(row["canonical_code"], "GOVERNANCE_BLOCKED")


if __name__ == "__main__":
    unittest.main()
