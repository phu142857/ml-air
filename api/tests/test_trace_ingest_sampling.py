"""Tests for span ingest and sampling helpers."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sdk.mlair_trace.ingest import ingest_span_batch, span_dict_to_row
from sdk.mlair_trace.sampling import trace_sample_ratio


class TestTraceIngest(unittest.TestCase):
    def test_span_dict_to_row(self) -> None:
        row = span_dict_to_row(
            {
                "trace_id": "abc123def4567890abc123def4567890",
                "span_id": "1111222233334444",
                "name": "train",
                "start_ts": "2026-07-08T10:00:00+00:00",
                "end_ts": "2026-07-08T10:01:00+00:00",
                "status": "SUCCESS",
            },
            tenant_id="t1",
            project_id="p1",
            default_service="worker",
        )
        assert row is not None
        self.assertEqual(row["service_name"], "worker")
        self.assertEqual(row["tenant_id"], "t1")

    @patch("sdk.mlair_trace.ingest.persist_span_rows", return_value=1)
    def test_ingest_span_batch(self, _mock_persist) -> None:
        written = ingest_span_batch(
            {
                "resource": {"service.name": "ext-worker"},
                "spans": [
                    {
                        "trace_id": "abc123def4567890abc123def4567890",
                        "span_id": "1111222233334444",
                        "name": "step",
                        "start_ts": "2026-07-08T10:00:00+00:00",
                    }
                ],
            },
            tenant_id="t1",
            project_id="p1",
        )
        self.assertEqual(written, 1)


class TestTraceSampling(unittest.TestCase):
    @patch.dict("os.environ", {"ML_AIR_OTEL_TRACE_SAMPLE_RATIO": "0.25"}, clear=False)
    def test_trace_sample_ratio(self) -> None:
        self.assertEqual(trace_sample_ratio(), 0.25)
