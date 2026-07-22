"""Unit tests for Phase 5 smart MLOps."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.lifecycle.drift_service import (
    build_version_quality_summary,
    compare_version_drift,
    compute_psi,
    evaluate_drift_gate,
    extract_label_profile,
    parse_drift_policy,
)
from app.domains.orchestration.tracking_service import compare_runs, export_run_metrics, summarize_metrics


class TestDriftService(unittest.TestCase):
    def test_compute_psi_identical(self) -> None:
        dist = {"a": 50.0, "b": 50.0}
        self.assertAlmostEqual(compute_psi(dist, dist), 0.0, places=6)

    def test_compute_psi_shifted(self) -> None:
        baseline = {"a": 90.0, "b": 10.0}
        current = {"a": 10.0, "b": 90.0}
        self.assertGreater(compute_psi(baseline, current), 0.2)

    def test_extract_label_profile_from_details(self) -> None:
        version = {
            "version_id": "v1",
            "record_count": 100,
            "details": {"label_distribution": {"cat": 60, "dog": 40}},
        }
        profile = extract_label_profile(version)
        self.assertEqual(profile["label_distribution"]["cat"], 60.0)

    def test_build_version_quality_summary(self) -> None:
        summary = build_version_quality_summary(
            {
                "version_id": "v1",
                "version": "1",
                "record_count": 10,
                "quality_score": 80,
                "details": {"labels": {"x": 10}},
            }
        )
        self.assertEqual(summary["label_count"], 1)
        self.assertEqual(summary["sample_count"], 10)

    def test_parse_drift_policy(self) -> None:
        rules = [{"type": "data_drift", "max_psi": 0.15}]
        self.assertEqual(parse_drift_policy(rules)["max_psi"], 0.15)

    def test_compare_version_drift(self) -> None:
        from_v = {"details": {"labels": {"a": 80, "b": 20}}}
        to_v = {"details": {"labels": {"a": 20, "b": 80}}}
        out = compare_version_drift(from_v, to_v)
        self.assertIsNotNone(out["psi"])
        self.assertIn("a", out["label_distribution_delta"])

    @patch("app.domains.lifecycle.drift_service.lineage_service.get_dataset_version")
    @patch("app.domains.lifecycle.drift_service.lineage_service.list_dataset_versions")
    def test_evaluate_drift_gate_blocks(self, mock_list, mock_get) -> None:
        mock_get.side_effect = lambda _t, _p, vid: {
            "baseline": {"version_id": "baseline", "details": {"labels": {"a": 90, "b": 10}}},
            "current": {"version_id": "current", "details": {"labels": {"a": 10, "b": 90}}},
        }[vid]
        mock_list.return_value = [
            {"version_id": "current"},
            {"version_id": "baseline"},
        ]
        ok, report = evaluate_drift_gate(
            tenant_id="t",
            project_id="p",
            dataset_id="ds",
            dataset_version_id="current",
            validation_rules=[{"type": "data_drift", "max_psi": 0.1}],
        )
        self.assertFalse(ok)
        self.assertTrue(report["drift_exceeded"])


class TestTrackingPhase5(unittest.TestCase):
    def test_summarize_metrics(self) -> None:
        summary = summarize_metrics(
            [
                {"key": "loss", "value": 1.0, "step": 0},
                {"key": "loss", "value": 0.5, "step": 1},
                {"key": "accuracy", "value": 0.8, "step": 1},
            ]
        )
        self.assertEqual(summary["loss"]["best"], 0.5)
        self.assertEqual(summary["accuracy"]["latest"], 0.8)

    @patch("app.domains.orchestration.tracking_service.get_run")
    @patch("app.domains.orchestration.tracking_service.usage_service.get_run_usage_bundle")
    @patch("app.domains.orchestration.tracking_service.db_conn")
    def test_compare_runs_regression(self, mock_db, mock_usage, mock_get_run) -> None:
        mock_get_run.side_effect = lambda run_id: {
            "run-a": {
                "run_id": "run-a",
                "status": "SUCCESS",
                "pipeline_id": "pipe",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:10:00+00:00",
            },
            "run-b": {
                "run_id": "run-b",
                "status": "SUCCESS",
                "pipeline_id": "pipe",
                "created_at": "2026-01-01T01:00:00+00:00",
                "updated_at": "2026-01-01T01:20:00+00:00",
            },
        }[run_id]
        mock_usage.return_value = {"usage": {"cpu_seconds": 10, "gpu_seconds": 0, "memory_rss_peak_kb": 1000}}

        class _Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def execute(self, *_args, **_kwargs):
                return None

            def fetchall(self):
                return [
                    ("run-a", "accuracy", 0.9, 0, None),
                    ("run-b", "accuracy", 0.7, 0, None),
                ]

        class _Conn:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def cursor(self):
                return _Cursor()

        mock_db.return_value = _Conn()
        out = compare_runs(["run-a", "run-b"], baseline_run_id="run-a")
        self.assertEqual(out["baseline_run_id"], "run-a")
        run_b = next(item for item in out["runs"] if item["run_id"] == "run-b")
        self.assertTrue(any(r["type"] == "metric" for r in run_b["regressions"]))

    @patch("app.domains.orchestration.tracking_service.get_run_tracking")
    def test_export_run_metrics_csv(self, mock_tracking) -> None:
        mock_tracking.return_value = {
            "metrics": [{"key": "loss", "value": 0.1, "step": 0, "logged_at": "2026-01-01T00:00:00+00:00"}]
        }
        body, media_type, filename = export_run_metrics("run-1", "csv")
        self.assertIn("text/csv", media_type)
        self.assertIn("loss", body)
        self.assertTrue(filename.endswith(".csv"))


if __name__ == "__main__":
    unittest.main()
