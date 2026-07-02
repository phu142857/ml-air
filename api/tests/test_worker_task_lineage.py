"""External worker complete persists lineage (ingest_lineage_from_task, fail-soft)."""

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

from app.domains.orchestration import worker_task_service as wts


def _running_row() -> dict:
    return {
        "tenant_id": "default",
        "project_id": "default_project",
        "run_id": "run-lineage-1",
        "status": "RUNNING",
        "leased_by": "worker-1",
        "attempt": 1,
        "pipeline_id": "example-pipeline",
        "plugin": "detect",
        "plugin_name": "detect",
        "plugin_context": {},
        "started_at": datetime.now(timezone.utc),
        "priority": "normal",
        "pipeline_version_id": None,
        "config_snapshot": None,
        "replay_from_task_id": None,
    }


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


_SAMPLE_LINEAGE = {
    "inputs": [{"name": "example-dataset", "version": "v2", "source_type": "csv_import"}],
    "outputs": [
        {"name": "detected", "version": "v1", "source_type": "csv_import"},
        {"name": "not-detected", "version": "v1", "source_type": "csv_import"},
    ],
}


class TestWorkerTaskLineage(unittest.TestCase):
    @patch("app.domains.orchestration.worker_task_service.append_task_run_log")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_task_updated")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_run_tracking_updated")
    @patch("app.domains.orchestration.worker_task_service.publish_task_finished")
    @patch("app.domains.orchestration.worker_task_service._persist_run_plugin_tracking")
    @patch("app.domains.orchestration.worker_task_service.connect")
    @patch("app.domains.lifecycle.lineage_service.ingest_lineage_from_task")
    @patch("app.domains.orchestration.worker_task_service.external_execution_enabled", return_value=True)
    @patch("app.domains.orchestration.worker_task_service._load_task_run_row")
    def test_complete_without_lineage_skips_ingest(
        self,
        mock_load: MagicMock,
        _mock_ext: MagicMock,
        mock_ingest: MagicMock,
        mock_connect: MagicMock,
        *_rest: MagicMock,
    ) -> None:
        mock_load.return_value = _running_row()
        mock_connect.return_value = _connect_ctx()

        outcome, detail = wts.complete_task(
            task_id="task-1",
            worker_id="worker-cv-1",
            metrics={},
            artifacts=None,
            artifact_uri=None,
            principal=None,
        )

        self.assertEqual(outcome, "ok")
        self.assertEqual(detail["status"], "SUCCESS")
        mock_ingest.assert_not_called()

    @patch("app.domains.orchestration.worker_task_service.append_task_run_log")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_task_updated")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_run_tracking_updated")
    @patch("app.domains.orchestration.worker_task_service.publish_task_finished")
    @patch("app.domains.orchestration.worker_task_service._persist_run_plugin_tracking")
    @patch("app.domains.orchestration.worker_task_service.connect")
    @patch("app.domains.lifecycle.lineage_service.ingest_lineage_from_task")
    @patch("app.domains.orchestration.worker_task_service.external_execution_enabled", return_value=True)
    @patch("app.domains.orchestration.worker_task_service._load_task_run_row")
    def test_complete_with_lineage_calls_ingest_and_stores_block(
        self,
        mock_load: MagicMock,
        _mock_ext: MagicMock,
        mock_ingest: MagicMock,
        mock_connect: MagicMock,
        _mock_persist: MagicMock,
        mock_publish: MagicMock,
        *_rest: MagicMock,
    ) -> None:
        mock_load.return_value = _running_row()
        mock_connect.return_value = _connect_ctx()

        wts.complete_task(
            task_id="task-1",
            worker_id="worker-cv-1",
            metrics={},
            artifacts=None,
            artifact_uri=None,
            lineage=_SAMPLE_LINEAGE,
            principal=None,
        )

        mock_ingest.assert_called_once_with(
            "default",
            "default_project",
            "run-lineage-1",
            "task-1",
            _SAMPLE_LINEAGE,
        )
        done = mock_publish.call_args[0][0]
        self.assertEqual(done["plugin_exec"]["result"]["lineage"], _SAMPLE_LINEAGE)

    @patch("app.domains.orchestration.worker_task_service.append_task_run_log")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_task_updated")
    @patch("app.domains.orchestration.worker_task_service.rt.emit_run_tracking_updated")
    @patch("app.domains.orchestration.worker_task_service.publish_task_finished")
    @patch("app.domains.orchestration.worker_task_service._persist_run_plugin_tracking")
    @patch("app.domains.orchestration.worker_task_service.connect")
    @patch("app.domains.lifecycle.lineage_service.ingest_lineage_from_task", side_effect=RuntimeError("db down"))
    @patch("app.domains.orchestration.worker_task_service.external_execution_enabled", return_value=True)
    @patch("app.domains.orchestration.worker_task_service._load_task_run_row")
    def test_complete_lineage_ingest_failure_is_fail_soft(
        self,
        mock_load: MagicMock,
        _mock_ext: MagicMock,
        _mock_ingest: MagicMock,
        mock_connect: MagicMock,
        _mock_persist: MagicMock,
        mock_publish: MagicMock,
        _emit_tracking: MagicMock,
        _emit_task: MagicMock,
        mock_append_log: MagicMock,
    ) -> None:
        mock_load.return_value = _running_row()
        mock_connect.return_value = _connect_ctx()

        outcome, detail = wts.complete_task(
            task_id="task-1",
            worker_id="worker-cv-1",
            metrics={},
            artifacts=None,
            artifact_uri=None,
            lineage=_SAMPLE_LINEAGE,
            principal=None,
        )

        self.assertEqual(outcome, "ok")
        self.assertEqual(detail["status"], "SUCCESS")
        mock_publish.assert_called_once()
        warn_calls = [
            c
            for c in mock_append_log.call_args_list
            if c.kwargs.get("level") == "WARNING"
            and "lineage_ingest_on_complete_failed" in str(c.kwargs.get("message", ""))
        ]
        self.assertEqual(len(warn_calls), 1)

    def test_should_ingest_lineage_on_complete(self) -> None:
        self.assertFalse(wts._should_ingest_lineage_on_complete({}))
        self.assertTrue(wts._should_ingest_lineage_on_complete({"inputs": [], "outputs": [{"name": "x"}]}))


if __name__ == "__main__":
    unittest.main()
