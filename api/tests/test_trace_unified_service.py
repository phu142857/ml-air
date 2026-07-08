"""Unified waterfall builder."""

from __future__ import annotations

import unittest

from app.domains.observability.trace_unified_service import build_unified_waterfall, trace_is_live


class TestTraceUnifiedService(unittest.TestCase):
    def test_build_unified_merges_mlair_and_otel(self) -> None:
        wf = build_unified_waterfall(
            trace_id="abc",
            waterfall={
                "run_id": "run-1",
                "pipeline_id": "pipe",
                "anchor_ts": "2026-01-01T00:00:00+00:00",
                "total_ms": 1000,
                "steps": [
                    {
                        "kind": "run",
                        "id": "run-1",
                        "label": "Run",
                        "status": "SUCCESS",
                        "start_ts": "2026-01-01T00:00:00+00:00",
                        "end_ts": "2026-01-01T00:00:01+00:00",
                        "duration_ms": 1000,
                        "offset_ms": 0,
                        "width_ms": 1000,
                        "end_offset_ms": 1000,
                        "is_instant": False,
                    }
                ],
            },
            otel_trace={
                "trace_id": "abc",
                "spans": [
                    {
                        "span_id": "s1",
                        "name": "GET /v1",
                        "service": "mlair-api",
                        "status": "SUCCESS",
                        "start_ts": "2026-01-01T00:00:00.500000+00:00",
                        "end_ts": "2026-01-01T00:00:00.800000+00:00",
                        "duration_ms": 300,
                        "depth": 0,
                        "tree_prefix": "",
                        "attributes": {},
                        "is_instant": False,
                    }
                ],
            },
            primary_run_id="run-1",
        )
        self.assertIsNotNone(wf)
        assert wf is not None
        self.assertEqual(wf["step_count"], 2)
        self.assertEqual(wf["mlair_count"], 1)
        self.assertEqual(wf["otel_count"], 1)
        self.assertEqual(wf["steps"][0]["source"], "mlair")
        self.assertEqual(wf["steps"][1]["source"], "otel")

    def test_trace_is_live_from_run_status(self) -> None:
        live = trace_is_live(
            runs=[{"status": "RUNNING"}],
            waterfall=None,
            otel_trace=None,
        )
        self.assertTrue(live)


if __name__ == "__main__":
    unittest.main()
