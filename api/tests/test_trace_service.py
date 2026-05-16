"""Unified trace_id resolution (OTel + legacy X-Trace-Id)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.domains.observability import trace_service


class TestTraceService(unittest.TestCase):
    def tearDown(self) -> None:
        trace_service.clear_trace_id()

    def test_trace_id_from_traceparent(self) -> None:
        tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        self.assertEqual(trace_service.trace_id_from_traceparent(tp), "4bf92f3577b34da6a3ce929d0e0e4736")

    def test_legacy_header_when_otel_off(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_OTEL_ENABLED", None)
            trace_service.bind_request_trace_id("client-trace-1")
            self.assertEqual(trace_service.get_trace_id(), "client-trace-1")

    def test_legacy_generates_uuid_when_otel_off_and_no_header(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_OTEL_ENABLED", None)
            trace_service.bind_request_trace_id(None)
            tid = trace_service.get_trace_id()
            self.assertTrue(len(tid) >= 32)

    def test_get_trace_id_prefers_otel_span(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_OTEL_ENABLED": "1"}, clear=False):
            trace_service.bind_request_trace_id(None)
            with patch(
                "app.domains.observability.trace_service.current_otel_trace_id",
                return_value="a" * 32,
            ):
                self.assertEqual(trace_service.get_trace_id(), "a" * 32)

    def test_resolve_trace_id_from_event_uses_traceparent(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_OTEL_ENABLED", None)
            tid = trace_service.resolve_trace_id_from_event(
                {
                    "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
                }
            )
            self.assertEqual(tid, "4bf92f3577b34da6a3ce929d0e0e4736")

    def test_ensure_event_trace_id(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_OTEL_ENABLED", None)
            trace_service.set_trace_id("evt-trace")
            ev: dict[str, str] = {"run_id": "r1"}
            trace_service.ensure_event_trace_id(ev)
            self.assertEqual(ev["trace_id"], "evt-trace")


if __name__ == "__main__":
    unittest.main()
