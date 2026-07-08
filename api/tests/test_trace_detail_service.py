"""Trace explorer aggregation by trace_id."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.domains.observability import trace_detail_service
from app.domains.observability.trace_service import canonical_trace_id, trace_id_lookup_candidates


class TestTraceIdNormalization(unittest.TestCase):
    def test_canonical_from_traceparent(self) -> None:
        tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        self.assertEqual(canonical_trace_id(tp), "4bf92f3577b34da6a3ce929d0e0e4736")

    def test_lookup_candidates_include_dashed_and_hex(self) -> None:
        uid = "746c3518-edca-421a-b600-fb20133e11ad"
        cands = trace_id_lookup_candidates(uid)
        self.assertIn("746c3518edca421ab600fb20133e11ad", cands)
        self.assertTrue(any("-" in c for c in cands))


class TestTraceDetailService(unittest.TestCase):
    @patch("app.domains.observability.trace_detail_service.fetch_tempo_trace")
    @patch("app.domains.observability.trace_detail_service._build_waterfall")
    @patch("app.domains.observability.trace_detail_service._fetch_logs_for_runs")
    @patch("app.domains.observability.trace_detail_service._fetch_audit_for_runs")
    @patch("app.domains.observability.trace_detail_service._fetch_semantic_events")
    @patch("app.domains.observability.trace_detail_service._fetch_runs")
    def test_get_trace_detail_includes_phase2_fields(
        self,
        mock_runs: MagicMock,
        mock_events: MagicMock,
        mock_audit: MagicMock,
        mock_logs: MagicMock,
        mock_waterfall: MagicMock,
        mock_tempo: MagicMock,
    ) -> None:
        mock_runs.return_value = [
            {
                "run_id": "run-1",
                "pipeline_id": "pipe-1",
                "status": "SUCCESS",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:05:00+00:00",
                "trace_id": "abc123",
            }
        ]
        mock_events.return_value = [
            {
                "event_id": "ev-1",
                "type": "run.completed",
                "ts": "2026-01-01T00:05:00+00:00",
                "run_id": "run-1",
                "payload": {"status": "SUCCESS"},
            }
        ]
        mock_audit.return_value = [
            {
                "ts": "2026-01-01T00:01:00+00:00",
                "kind": "run.updated",
                "resource_type": "run",
                "resource_id": "run-1",
                "source": None,
                "payload": {"status": "RUNNING"},
            }
        ]
        mock_logs.return_value = [
            {
                "ts": "2026-01-01T00:02:00+00:00",
                "level": "INFO",
                "message": "epoch 1",
                "trace_id": "abc123",
                "run_id": "run-1",
                "task_id": "run-1:train",
                "plugin": "train",
                "payload": {"task_id": "run-1:train"},
            }
        ]
        mock_waterfall.return_value = {
            "run_id": "run-1",
            "pipeline_id": "pipe-1",
            "anchor_ts": "2026-01-01T00:00:00+00:00",
            "total_ms": 300_000,
            "steps": [
                {
                    "kind": "run",
                    "id": "run-1",
                    "label": "Run",
                    "status": "SUCCESS",
                    "start_ts": "2026-01-01T00:00:00+00:00",
                    "end_ts": "2026-01-01T00:05:00+00:00",
                    "duration_ms": 300_000,
                    "plugin": None,
                    "offset_ms": 0,
                    "width_ms": 300_000,
                    "end_offset_ms": 300_000,
                    "is_instant": False,
                }
            ],
        }

        mock_tempo.return_value = {
            "trace_id": "abc123",
            "anchor_ts": "2026-01-01T00:00:00+00:00",
            "total_ms": 100,
            "services": ["mlair-api"],
            "span_count": 1,
            "spans": [],
        }

        detail = trace_detail_service.get_trace_detail(
            tenant_id="t1",
            project_id="p1",
            trace_id="abc123",
        )

        self.assertIsNotNone(detail)
        assert detail is not None
        self.assertEqual(detail["primary_run_id"], "run-1")
        self.assertEqual(detail["audit_count"], 1)
        self.assertEqual(detail["log_count"], 1)
        self.assertIsNotNone(detail["waterfall"])
        self.assertEqual(detail["otel_span_count"], 1)
        mock_tempo.assert_called_once()
        mock_audit.assert_called_once_with(tenant_id="t1", project_id="p1", run_ids=["run-1"])
        mock_logs.assert_called_once_with(["run-1"])
        mock_waterfall.assert_called_once_with("run-1")

    @patch("app.domains.orchestration.run_service.get_run")
    def test_build_waterfall_includes_tasks(self, mock_get_run: MagicMock) -> None:
        mock_get_run.return_value = {
            "run_id": "run-1",
            "status": "SUCCESS",
            "created_at": datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 1, 1, 0, 10, tzinfo=timezone.utc),
        }
        with patch(
            "app.domains.orchestration.task_service.list_tasks_by_run",
            return_value=[
                {
                    "task_id": "run-1:train",
                    "status": "SUCCESS",
                    "plugin": "app_train_adapter",
                    "created_at": "2026-01-01T00:00:30+00:00",
                    "updated_at": "2026-01-01T00:08:00+00:00",
                    "started_at": "2026-01-01T00:01:00+00:00",
                    "finished_at": "2026-01-01T00:08:00+00:00",
                    "duration_ms": 420_000,
                }
            ],
        ):
            wf = trace_detail_service._build_waterfall("run-1")

        self.assertIsNotNone(wf)
        assert wf is not None
        self.assertEqual(wf["run_id"], "run-1")
        self.assertEqual(len(wf["steps"]), 2)
        self.assertEqual(wf["steps"][1]["kind"], "task")
        self.assertEqual(wf["steps"][1]["plugin"], "app_train_adapter")
        self.assertEqual(wf["steps"][1]["end_offset_ms"], wf["steps"][1]["offset_ms"] + wf["steps"][1]["width_ms"])
        self.assertGreater(wf["total_ms"], 0)

    @patch("app.domains.orchestration.run_service.get_run")
    def test_build_waterfall_marks_queued_task_instant(self, mock_get_run: MagicMock) -> None:
        mock_get_run.return_value = {
            "run_id": "run-1",
            "status": "RUNNING",
            "pipeline_id": "pipe-1",
            "created_at": datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 1, 1, 0, 10, tzinfo=timezone.utc),
        }
        with patch(
            "app.domains.orchestration.task_service.list_tasks_by_run",
            return_value=[
                {
                    "task_id": "run-1:eval",
                    "status": "PENDING",
                    "plugin": "eval",
                    "created_at": "2026-01-01T00:02:00+00:00",
                    "updated_at": "2026-01-01T00:02:00+00:00",
                    "started_at": None,
                    "finished_at": None,
                    "duration_ms": None,
                }
            ],
        ):
            wf = trace_detail_service._build_waterfall("run-1")

        self.assertIsNotNone(wf)
        assert wf is not None
        queued = wf["steps"][1]
        self.assertTrue(queued["is_instant"])
        self.assertEqual(queued["width_ms"], 0)

    @patch("app.domains.observability.audit_timeline_service.list_audit_timeline")
    @patch("app.domains.orchestration.task_service.list_tasks_by_run")
    def test_fetch_audit_dedupes_rows(self, mock_tasks: MagicMock, mock_audit: MagicMock) -> None:
        mock_tasks.return_value = []
        row = {
            "ts": "2026-01-01T00:00:00+00:00",
            "kind": "run.updated",
            "resource_type": "run",
            "resource_id": "run-1",
            "source": None,
            "payload": {},
        }
        mock_audit.return_value = [row, row]

        items = trace_detail_service._fetch_audit_for_runs(
            tenant_id="t1",
            project_id="p1",
            run_ids=["run-1"],
        )
        self.assertEqual(len(items), 1)

    @patch("app.domains.orchestration.log_service.read_run_logs_page")
    def test_fetch_logs_tail_per_run(self, mock_page: MagicMock) -> None:
        mock_page.return_value = MagicMock(
            items=[
                {
                    "ts": "2026-01-01T00:00:00+00:00",
                    "level": "INFO",
                    "message": "hello",
                    "trace_id": "abc",
                    "payload": {"task_id": "t1", "plugin": "train"},
                }
            ]
        )
        logs = trace_detail_service._fetch_logs_for_runs(["run-1"])
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["task_id"], "t1")
        mock_page.assert_called_once_with("run-1", limit=500, tail=True)


if __name__ == "__main__":
    unittest.main()
