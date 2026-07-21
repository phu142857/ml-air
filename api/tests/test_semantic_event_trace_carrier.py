"""Semantic realtime events carry trace context when published."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.lifecycle.realtime_events import build_event, publish_mlair_event, EventType


class TestSemanticEventTraceCarrier(unittest.TestCase):
    @patch("app.domains.lifecycle.realtime_events.realtime_enabled", return_value=False)
    @patch("app.domains.lifecycle.semantic_event_contract.validate_semantic_event_if_enabled", return_value=True)
    @patch("app.otel_api.inject_redis_trace_carrier")
    def test_publish_mlair_event_calls_trace_inject(
        self,
        mock_inject,
        _validate,
        _rt,
    ) -> None:
        event = build_event(
            event_type=EventType.TRAINING_TRIGGERED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-1",
            trace_id="abc",
            payload={"run_id": "run-1"},
        )
        publish_mlair_event(event)
        mock_inject.assert_called_once()
        injected = mock_inject.call_args[0][0]
        self.assertEqual(injected.get("type"), "training.triggered")


if __name__ == "__main__":
    unittest.main()
