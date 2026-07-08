"""Tempo OTLP span fetch for trace explorer Phase 3."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from app.domains.observability import trace_tempo_service as tempo


class TestTraceTempoService(unittest.TestCase):
    def test_trace_otel_spans_enabled_by_default(self) -> None:
        with patch.dict("os.environ", {}, clear=False):
            import os

            os.environ.pop("ML_AIR_TRACE_OTEL_SPANS", None)
            self.assertTrue(tempo.trace_otel_spans_enabled())

    def test_finalize_span_tree_depth_and_offsets(self) -> None:
        spans = [
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
        out = tempo._finalize_span_tree(spans, "abc123")
        self.assertEqual(out["span_count"], 2)
        self.assertEqual(out["spans"][0]["depth"], 0)
        self.assertEqual(out["spans"][1]["depth"], 1)
        self.assertIn("tree_prefix", out["spans"][1])
        self.assertGreater(out["total_ms"], 0)

    @patch("app.domains.observability.trace_tempo_service.urllib.request.urlopen")
    def test_fetch_tempo_trace_parses_batches(self, mock_urlopen: MagicMock) -> None:
        payload = {
            "batches": [
                {
                    "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "mlair-api"}}]},
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "traceId": "abc123abc123abc123abc123abc123",
                                    "spanId": "1111111111111111",
                                    "name": "GET /health",
                                    "startTimeUnixNano": "1000000000",
                                    "endTimeUnixNano": "2000000000",
                                    "status": {"code": "STATUS_CODE_OK"},
                                    "attributes": [],
                                }
                            ]
                        }
                    ],
                }
            ]
        }
        resp = MagicMock()
        resp.read.return_value = json.dumps(payload).encode("utf-8")
        resp.__enter__.return_value = resp
        mock_urlopen.return_value = resp

        with patch.dict(
            "os.environ",
            {
                "ML_AIR_TRACE_OTEL_SPANS": "1",
                "ML_AIR_TEMPO_QUERY_URL": "http://tempo:3200",
            },
            clear=False,
        ):
            out = tempo.fetch_tempo_trace(trace_id="abc123abc123abc123abc123abc123")

        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out["span_count"], 1)
        self.assertEqual(out["spans"][0]["name"], "GET /health")

    @patch("app.domains.observability.trace_tempo_service.urllib.request.urlopen")
    def test_search_tempo_traces_parses_results(self, mock_urlopen: MagicMock) -> None:
        payload = {
            "traces": [
                {
                    "traceID": "abc123abc123abc123abc123abc123",
                    "rootServiceName": "mlair-api",
                    "rootTraceName": "GET /runs",
                    "durationMs": 120,
                }
            ]
        }
        resp = MagicMock()
        resp.read.return_value = json.dumps(payload).encode("utf-8")
        resp.__enter__.return_value = resp
        mock_urlopen.return_value = resp

        with patch.dict(
            "os.environ",
            {
                "ML_AIR_TRACE_OTEL_SPANS": "1",
                "ML_AIR_TEMPO_QUERY_URL": "http://tempo:3200",
            },
            clear=False,
        ):
            out = tempo.search_tempo_traces(query="abc123", limit=10)

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "tempo")
        self.assertEqual(out[0]["root_service"], "mlair-api")
        self.assertEqual(out[0]["duration_ms"], 120)


if __name__ == "__main__":
    unittest.main()
