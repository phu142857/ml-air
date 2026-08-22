"""Phase V ecosystem — SDK connectors and closed-loop client helpers."""

from __future__ import annotations

import unittest


class TestMlflowExportPayload(unittest.TestCase):
    def test_build_payload_includes_run_tag(self) -> None:
        from sdk.connectors.mlflow_export import build_mlflow_run_payload

        payload = build_mlflow_run_payload(
            run_id="run-abc-123",
            experiment_name="demo",
            params={"lr": 0.01},
            metrics={"accuracy": 0.91},
            tags={"env": "dev"},
        )
        self.assertEqual(payload["experiment_name"], "demo")
        self.assertEqual(len(payload["metrics"]), 1)
        self.assertEqual(payload["metrics"][0]["key"], "accuracy")
        tag_keys = {t["key"] for t in payload["tags"]}
        self.assertIn("mlair.run_id", tag_keys)
        self.assertIn("env", tag_keys)

    def test_params_sorted(self) -> None:
        from sdk.connectors.mlflow_export import build_mlflow_run_payload

        payload = build_mlflow_run_payload(
            run_id="r1",
            experiment_name="x",
            params={"z": 1, "a": 2},
        )
        keys = [p["key"] for p in payload["params"]]
        self.assertEqual(keys, ["a", "z"])


class TestSdkClosedLoopHelpers(unittest.TestCase):
    def test_trigger_policy_payload_shape(self) -> None:
        # Pure shape test — documents SDK contract without HTTP.
        payload = {
            "trigger_mode": "drift",
            "debounce_minutes": 15,
            "schedule_cron": None,
        }
        self.assertEqual(payload["trigger_mode"], "drift")
        self.assertGreaterEqual(payload["debounce_minutes"], 1)

    def test_production_metrics_sample_shape(self) -> None:
        samples = [{"metric_key": "accuracy", "value": 0.9}, {"metric_key": "latency_ms", "value": 120.0}]
        self.assertTrue(all("metric_key" in s and "value" in s for s in samples))
