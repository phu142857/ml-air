"""Pure unit tests for readiness evaluation semantic dedupe helpers (no DB)."""

from __future__ import annotations

import unittest

from app.services.readiness_evaluation_semantics import readiness_eval_result_matches_stored_row


class TestReadinessEvalDedupe(unittest.TestCase):
    def test_matches_when_reasons_reordered(self) -> None:
        result = {
            "required_size": 100,
            "current_size": 50,
            "status": "blocked",
            "policy_id": "pol-1",
            "dataset_version_id": "v-1",
            "reasons": [{"code": "b", "message": "y"}, {"code": "a", "message": "x"}],
        }
        stored = {
            "required_size": 100,
            "current_size": 50,
            "status": "blocked",
            "policy_id": "pol-1",
            "dataset_version_id": "v-1",
            "reasons": [{"code": "a", "message": "x"}, {"code": "b", "message": "y"}],
        }
        self.assertTrue(readiness_eval_result_matches_stored_row(stored, result))

    def test_no_match_current_size(self) -> None:
        result = {
            "required_size": 100,
            "current_size": 51,
            "status": "blocked",
            "policy_id": "pol-1",
            "dataset_version_id": "v-1",
            "reasons": [],
        }
        stored = {
            "required_size": 100,
            "current_size": 50,
            "status": "blocked",
            "policy_id": "pol-1",
            "dataset_version_id": "v-1",
            "reasons": [],
        }
        self.assertFalse(readiness_eval_result_matches_stored_row(stored, result))

    def test_matches_null_version_both_sides(self) -> None:
        result = {
            "required_size": 1,
            "current_size": 0,
            "status": "blocked",
            "policy_id": "",
            "dataset_version_id": None,
            "reasons": [{"code": "size_threshold", "message": "small"}],
        }
        stored = {
            "required_size": 1,
            "current_size": 0,
            "status": "blocked",
            "policy_id": "",
            "dataset_version_id": None,
            "reasons": [{"code": "size_threshold", "message": "small"}],
        }
        self.assertTrue(readiness_eval_result_matches_stored_row(stored, result))


if __name__ == "__main__":
    unittest.main()
