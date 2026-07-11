"""Native span store for trace explorer."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.domains.observability import trace_span_tree
from app.domains.observability import trace_span_service as spans


class TestTraceSpanTree(unittest.TestCase):
    def test_finalize_span_tree_depth_and_offsets(self) -> None:
        rows = [
            {
                "span_id": "aaa",
                "parent_span_id": None,
                "name": "GET /runs",
                "service": "mlair-api",
                "kind": "",
                "status": "SUCCESS",
                "start_ts": "2026-01-01T00:00:00+00:00",
                "end_ts": "2026-01-01T00:00:02+00:00",
                "duration_ms": 2000,
                "attributes": {},
            },
            {
                "span_id": "bbb",
                "parent_span_id": "aaa",
                "name": "scheduler.consume_run",
                "service": "mlair-scheduler",
                "kind": "",
                "status": "SUCCESS",
                "start_ts": "2026-01-01T00:00:01+00:00",
                "end_ts": "2026-01-01T00:00:01.500000+00:00",
                "duration_ms": 500,
                "attributes": {},
            },
        ]
        out = trace_span_tree.finalize_span_tree(rows, "abc123")
        assert out is not None
        self.assertEqual(out["span_count"], 2)
        self.assertEqual(out["spans"][0]["depth"], 0)
        self.assertEqual(out["spans"][1]["depth"], 1)
        self.assertIn("tree_prefix", out["spans"][1])
        self.assertGreater(out["total_ms"], 0)


class TestTraceSpanService(unittest.TestCase):
    @patch("app.domains.observability.trace_span_service.db_conn")
    def test_fetch_stored_trace_builds_tree(self, mock_db_conn: MagicMock) -> None:
        conn = MagicMock()
        cur = MagicMock()
        cur.fetchall.return_value = [
            (
                "1111111111111111",
                None,
                "mlair-api",
                "GET /runs",
                "SERVER",
                "SUCCESS",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:02+00:00",
                2000,
                {},
            )
        ]
        conn.cursor.return_value.__enter__.return_value = cur
        mock_db_conn.return_value.__enter__.return_value = conn

        out = spans.fetch_stored_trace(trace_id="abc123abc123abc123abc123abc123")

        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out["span_count"], 1)
        self.assertEqual(out["spans"][0]["name"], "GET /runs")

    @patch("app.domains.observability.trace_span_service.db_conn")
    def test_search_stored_traces(self, mock_db_conn: MagicMock) -> None:
        conn = MagicMock()
        cur = MagicMock()
        cur.fetchall.return_value = [
            (
                "abc123abc123abc123abc123abc123",
                "mlair-api",
                "GET /runs",
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:02+00:00",
                120,
                "run-1",
                "demo-pipeline",
            )
        ]
        conn.cursor.return_value.__enter__.return_value = cur
        mock_db_conn.return_value.__enter__.return_value = conn

        out = spans.search_stored_traces(query="abc123", limit=10)

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "spans")
        self.assertEqual(out[0]["root_service"], "mlair-api")
        self.assertEqual(out[0]["duration_ms"], 120)
        self.assertEqual(out[0]["run_id"], "run-1")
        self.assertEqual(out[0]["pipeline_id"], "demo-pipeline")


if __name__ == "__main__":
    unittest.main()
