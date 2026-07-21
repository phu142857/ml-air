"""External worker complete/fail persists run tracking (metrics/artifacts)."""

from __future__ import annotations

import sys
import types
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

if "redis" not in sys.modules:
    _redis_stub = types.ModuleType("redis")
    _redis_stub.Redis = MagicMock  # type: ignore[attr-defined]
    sys.modules["redis"] = _redis_stub
if "psycopg" not in sys.modules:
    _psycopg_stub = types.ModuleType("psycopg")
    _psycopg_stub.connect = MagicMock  # type: ignore[attr-defined]
    sys.modules["psycopg"] = _psycopg_stub

from app.domains.orchestration import worker_task_service as wts


def _running_row(**overrides) -> dict:
    row = {
        "tenant_id": "default",
        "project_id": "default_project",
        "run_id": "run-tracking-1",
        "status": "RUNNING",
        "leased_by": "worker-1",
        "attempt": 1,
        "pipeline_id": "example-pipeline",
        "plugin": "cv_yolo_train",
        "plugin_name": "cv_yolo_train",
        "plugin_context": {"model_id": "model-1"},
        "started_at": datetime.now(timezone.utc),
        "priority": "normal",
        "pipeline_version_id": None,
        "config_snapshot": None,
        "replay_from_task_id": None,
    }
    row.update(overrides)
    return row


def _connect_ctx() -> MagicMock:
    conn = MagicMock()
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.rowcount = 1
    cur.fetchone.return_value = (datetime.now(timezone.utc),)
    conn.cursor.return_value = cur
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    return conn


class TestWorkerTaskTracking(unittest.TestCase):
    def test_resource_usage_for_done_event_forwards_contract_peaks(self) -> None:
        ru = wts._resource_usage_for_done_event(
            duration_ms=120_000,
            resource_usage={
                "memory_mb_peak": 693.61,
                "cpu_percent_peak": 92.0,
                "gpu_percent_peak": 88.0,
                "gpu_memory_mb_peak": 7420.0,
                "cpu_time_seconds": 3600.0,
                "disk_read_bytes": 100,
            },
        )
        self.assertEqual(ru["duration_ms"], 120_000)
        self.assertEqual(ru["memory_mb_peak"], 693.61)
        self.assertEqual(ru["cpu_percent_peak"], 92.0)
        self.assertEqual(ru["gpu_percent_peak"], 88.0)
        self.assertEqual(ru["memory_rss_kb"], int(693.61 * 1024))

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
            plugin_name="train",
            metrics={"mAP50": 0.91, "loss": {"value": 0.1, "step": 3}},
            artifacts=[{"path": "train/best.pt", "uri": "minio://x/best.pt"}],
        )
        mock_metric.assert_called_once()
        self.assertEqual(mock_metric.call_args.kwargs["key"], "train.mAP50")
        self.assertEqual(mock_metric.call_args.kwargs["value"], 0.91)
        mock_artifact.assert_called_once()
        self.assertEqual(mock_artifact.call_args.kwargs["path"], "train/best.pt")

    @patch("app.domains.orchestration.worker_task_service.append_task_run_log")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_task_updated")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_run_tracking_updated")
    @patch("app.domains.orchestration.worker_task_service.publish_task_finished")
    @patch("app.domains.orchestration.worker_task_service.log_metric")
    @patch("app.domains.orchestration.worker_task_service._persist_run_plugin_tracking")
    @patch("app.domains.orchestration.worker_task_service.connect")
    @patch("app.domains.orchestration.worker_task_service.external_execution_enabled", return_value=True)
    @patch("app.domains.orchestration.worker_task_service._load_task_run_row")
    @patch("app.domains.governance.model_registry_service.list_model_versions")
    @patch("app.domains.governance.model_registry_service.create_model_version")
    def test_complete_task_auto_registers_model_version_from_checkpoint(
        self,
        mock_create_version: MagicMock,
        mock_list_versions: MagicMock,
        mock_load: MagicMock,
        _mock_ext: MagicMock,
        mock_connect: MagicMock,
        _mock_persist: MagicMock,
        mock_metric: MagicMock,
        mock_publish: MagicMock,
        *_rest: MagicMock,
    ) -> None:
        mock_load.return_value = _running_row()
        mock_connect.return_value = _connect_ctx()
        mock_list_versions.return_value = []
        mock_create_version.return_value = {
            "version_id": "mv-1",
            "model_id": "model-1",
            "version": 3,
            "run_id": "run-tracking-1",
            "artifact_uri": "file:///tmp/best.pt",
            "stage": "staging",
        }

        outcome, detail = wts.complete_task(
            task_id="task-1",
            worker_id="worker-1",
            metrics={"mAP50": 0.9},
            artifacts=[{"path": "train/checkpoint", "uri": "file:///tmp/best.pt"}],
            artifact_uri=None,
            principal=None,
        )

        self.assertEqual(outcome, "ok")
        self.assertEqual(detail["status"], "SUCCESS")
        mock_create_version.assert_called_once_with(
            model_id="model-1",
            run_id="run-tracking-1",
            artifact_uri="file:///tmp/best.pt",
            stage="staging",
        )
        done = mock_publish.call_args[0][0]
        self.assertEqual(done["plugin_exec"]["result"]["model_version"]["version"], 3)
        metric_calls = [c.kwargs.get("key") for c in mock_metric.call_args_list]
        self.assertIn("cv_yolo_train.imported_version", metric_calls)

    @patch("app.domains.orchestration.worker_task_service.append_task_run_log")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_task_updated")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_run_tracking_updated")
    @patch("app.domains.orchestration.worker_task_service.publish_task_finished")
    @patch("app.domains.orchestration.worker_task_service.log_metric")
    @patch("app.domains.orchestration.worker_task_service._persist_run_plugin_tracking")
    @patch("app.domains.orchestration.worker_task_service.connect")
    @patch("app.domains.orchestration.worker_task_service.external_execution_enabled", return_value=True)
    @patch("app.domains.orchestration.worker_task_service._load_task_run_row")
    @patch("app.domains.governance.model_registry_service.list_model_versions")
    @patch("app.domains.governance.model_registry_service.create_model_version")
    def test_complete_task_reuses_existing_model_version_for_same_run_and_artifact(
        self,
        mock_create_version: MagicMock,
        mock_list_versions: MagicMock,
        mock_load: MagicMock,
        _mock_ext: MagicMock,
        mock_connect: MagicMock,
        _mock_persist: MagicMock,
        _mock_metric: MagicMock,
        mock_publish: MagicMock,
        *_rest: MagicMock,
    ) -> None:
        mock_load.return_value = _running_row()
        mock_connect.return_value = _connect_ctx()
        mock_list_versions.return_value = [
            {
                "version_id": "mv-2",
                "model_id": "model-1",
                "version": 4,
                "run_id": "run-tracking-1",
                "artifact_uri": "file:///tmp/best.pt",
                "stage": "staging",
            }
        ]

        wts.complete_task(
            task_id="task-1",
            worker_id="worker-1",
            metrics={},
            artifacts=[{"path": "train/checkpoint", "uri": "file:///tmp/best.pt"}],
            artifact_uri=None,
            principal=None,
        )

        mock_create_version.assert_not_called()
        done = mock_publish.call_args[0][0]
        self.assertEqual(done["plugin_exec"]["result"]["model_version"]["version"], 4)


if __name__ == "__main__":
    unittest.main()
