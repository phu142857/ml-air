"""Lightweight tests for realtime event envelope and publish (startUpForRTS §7)."""

from __future__ import annotations

import json
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

# `realtime_events` imports `queue_service`, which imports `redis` — allow unittest without api venv.
if "redis" not in sys.modules:
    _redis_stub = types.ModuleType("redis")
    _redis_stub.Redis = MagicMock  # type: ignore[attr-defined]
    sys.modules["redis"] = _redis_stub

from app.services.realtime_events import (
    EventType,
    build_event,
    publish_mlair_event,
    realtime_enabled,
)


class TestRealtimeEvents(unittest.TestCase):
    def test_build_event_shape(self) -> None:
        ev = build_event(
            event_type=EventType.RUN_CREATED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-1",
            payload={"status": "PENDING", "updated_at": 1.0},
            trace_id="trace-xyz",
        )
        self.assertEqual(ev["version"], "v1")
        self.assertEqual(ev["type"], "run.created")
        self.assertEqual(ev["tenant_id"], "t1")
        self.assertEqual(ev["project_id"], "p1")
        self.assertEqual(ev["resource_id"], "run-1")
        self.assertEqual(ev["trace_id"], "trace-xyz")
        self.assertIn("event_id", ev)
        self.assertIsInstance(ev["timestamp"], float)

    @patch("app.services.realtime_events.realtime_enabled", return_value=True)
    @patch("app.services.realtime_events.redis_client")
    def test_publish_uses_channel(self, mock_redis: MagicMock, _enabled: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        ev = build_event(
            event_type=EventType.TASK_UPDATED,
            tenant_id="default",
            project_id="default_project",
            resource_id="task-1",
            payload={"status": "RUNNING", "run_id": "r1", "updated_at": 2.0},
            trace_id="t1",
        )
        publish_mlair_event(ev)
        client.publish.assert_called_once()
        channel, raw = client.publish.call_args[0]
        self.assertEqual(channel, "mlair.events.default.default_project")
        parsed = json.loads(raw)
        self.assertEqual(parsed["type"], "task.updated")

    def test_realtime_enabled_default(self) -> None:
        self.assertTrue(realtime_enabled())

    def test_build_event_training_policy_updated(self) -> None:
        ev = build_event(
            event_type=EventType.TRAINING_POLICY_UPDATED,
            tenant_id="t1",
            project_id="p1",
            resource_id="ds-1",
            payload={"dataset_id": "ds-1", "policy_id": "pol-9", "action": "create", "updated_at": 3.0},
            trace_id="tr",
        )
        self.assertEqual(ev["type"], "training.policy.updated")
        self.assertEqual(ev["resource_id"], "ds-1")


if __name__ == "__main__":
    unittest.main()
