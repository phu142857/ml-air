"""Unit tests for Phase I model evaluation registry and lifecycle projection."""

from __future__ import annotations

import unittest

from app.domains.governance.model_evaluation_service import (
    evaluate_metrics_against_gates,
    record_model_evaluation,
)
from app.domains.lifecycle.lifecycle_projection_service import get_lifecycle_projection


class TestModelEvaluationGates(unittest.TestCase):
    def test_passes_when_metrics_meet_min(self) -> None:
        status, reasons = evaluate_metrics_against_gates(
            {"accuracy": 0.95},
            gates={"accuracy": {"min": 0.9}},
        )
        self.assertEqual(status, "passed")
        self.assertEqual(reasons, [])

    def test_fails_when_below_min(self) -> None:
        status, reasons = evaluate_metrics_against_gates(
            {"accuracy": 0.8},
            gates={"accuracy": {"min": 0.9}},
        )
        self.assertEqual(status, "failed")
        self.assertEqual(len(reasons), 1)
        self.assertEqual(reasons[0]["type"], "below_min")

    def test_regression_against_baseline(self) -> None:
        status, reasons = evaluate_metrics_against_gates(
            {"accuracy": 0.85},
            baseline_metrics={"accuracy": 0.9},
        )
        self.assertEqual(status, "failed")
        self.assertTrue(any(r.get("type") == "regression" for r in reasons))


class TestModelEvaluationRecord(unittest.TestCase):
    def test_invalid_status_raises(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            record_model_evaluation(
                tenant_id="t",
                project_id="p",
                model_id="m",
                version=1,
                status="unknown",
            )
        self.assertEqual(str(ctx.exception), "invalid_evaluation_status")


class TestLifecycleProjection(unittest.TestCase):
    def test_projection_shape(self) -> None:
        from unittest.mock import MagicMock, patch

        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        cur.fetchall.side_effect = [[], [], [], [], []]
        cur.fetchone.return_value = (0,)

        with patch("app.domains.lifecycle.lifecycle_projection_service.db_conn") as mock_db:
            mock_db.return_value.__enter__.return_value = conn
            out = get_lifecycle_projection("default", "default_project")
        self.assertEqual(out["version"], 1)
        self.assertIn("summary", out)
        self.assertIn("models", out)
        self.assertIn("datasets", out)
        self.assertIn("runs_by_status", out)


if __name__ == "__main__":
    unittest.main()
