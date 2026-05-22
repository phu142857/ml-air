"""External worker complete/fail persists run tracking (metrics/artifacts)."""

from __future__ import annotations

import sys
import types
import unittest
from unittest.mock import MagicMock, patch

if "redis" not in sys.modules:
    _redis_stub = types.ModuleType("redis")
    _redis_stub.Redis = MagicMock  # type: ignore[attr-defined]
    sys.modules["redis"] = _redis_stub

from app.domains.orchestration import worker_task_service as wts


class TestWorkerTaskTracking(unittest.TestCase):
    def test_normalize_complete_artifacts_uri_fallback(self) -> None:
        out = wts._normalize_complete_artifacts(None, "s3://bucket/model.pt")
        self.assertEqual(out, [{"path": "model", "uri": "s3://bucket/model.pt"}])

    def test_normalize_complete_artifacts_list(self) -> None:
        out = wts._normalize_complete_artifacts(
            [{"path": "train/best.pt", "uri": "minio://m/best.pt"}],
            None,
        )
        self.assertEqual(out[0]["path"], "train/best.pt")

    @patch("app.domains.orchestration.worker_task_service.log_artifact")
    @patch("app.domains.orchestration.worker_task_service.log_metric")
    def test_persist_run_plugin_tracking(self, mock_metric: MagicMock, mock_artifact: MagicMock) -> None:
        wts._persist_run_plugin_tracking(
            run_id="run-1",
            plugin_name="cv_yolo_train",
            metrics={"mAP50": 0.91, "loss": {"value": 0.1, "step": 3}},
            artifacts=[{"path": "train/best.pt", "uri": "minio://x/best.pt"}],
        )
        mock_metric.assert_called_once()
        self.assertEqual(mock_metric.call_args.kwargs["key"], "cv_yolo_train.mAP50")
        self.assertEqual(mock_metric.call_args.kwargs["value"], 0.91)
        mock_artifact.assert_called_once()
        self.assertEqual(mock_artifact.call_args.kwargs["path"], "train/best.pt")


if __name__ == "__main__":
    unittest.main()
