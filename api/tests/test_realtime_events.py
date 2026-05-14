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

    def test_build_event_training_triggered(self) -> None:
        ev = build_event(
            event_type=EventType.TRAINING_TRIGGERED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-99",
            payload={
                "run_id": "run-99",
                "model_id": "m1",
                "dataset_id": "d1",
                "dataset_version_id": "dv1",
                "pipeline_id": "pl1",
                "blocked_by_gate": False,
                "updated_at": 1.0,
            },
            trace_id="tr",
        )
        self.assertEqual(ev["type"], "training.triggered")
        self.assertEqual(ev["resource_id"], "run-99")
        self.assertEqual(ev["payload"]["dataset_version_id"], "dv1")

    def test_build_event_training_completed(self) -> None:
        ev = build_event(
            event_type=EventType.TRAINING_COMPLETED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-7",
            payload={
                "run_id": "run-7",
                "pipeline_id": "pl",
                "dataset_version_id": "dv9",
                "status": "SUCCESS",
                "updated_at": 9.0,
            },
            trace_id="tr",
        )
        self.assertEqual(ev["type"], "training.completed")
        self.assertEqual(ev["resource_id"], "run-7")

    def test_build_event_buffer_threshold_met(self) -> None:
        ev = build_event(
            event_type=EventType.BUFFER_THRESHOLD_MET,
            tenant_id="t1",
            project_id="p1",
            resource_id="ds-88",
            payload={
                "dataset_id": "ds-88",
                "source_type": "runtime_feedback",
                "current_size": 1000,
                "target_threshold": 1000,
                "accumulation_strategy": "snapshot_on_threshold",
                "window_status": "active",
                "updated_at": 12.0,
            },
            trace_id="tr",
        )
        self.assertEqual(ev["type"], "buffer.threshold_met")
        self.assertEqual(ev["resource_id"], "ds-88")

    def test_build_event_model_eligibility_updated(self) -> None:
        ev = build_event(
            event_type=EventType.MODEL_ELIGIBILITY_UPDATED,
            tenant_id="t1",
            project_id="p1",
            resource_id="m1",
            payload={
                "model_id": "m1",
                "action": "approval_updated",
                "version": 3,
                "approval_status": "approved",
                "updated_at": 4.0,
            },
            trace_id="tr",
        )
        self.assertEqual(ev["type"], "model.eligibility.updated")
        self.assertEqual(ev["resource_id"], "m1")
        self.assertEqual(ev["payload"]["action"], "approval_updated")

    def test_build_event_eligibility_updated_training_kind(self) -> None:
        ev = build_event(
            event_type=EventType.ELIGIBILITY_UPDATED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-1",
            payload={
                "kind": "training",
                "run_id": "run-1",
                "dataset_id": "ds1",
                "status": "eligible",
                "ready": True,
                "updated_at": 5.0,
            },
            trace_id="tr",
        )
        self.assertEqual(ev["type"], "eligibility.updated")
        self.assertEqual(ev["payload"]["kind"], "training")

    @patch("app.services.realtime_events.publish_mlair_event")
    def test_emit_training_eligibility_dual_publish(self, mock_pub: MagicMock) -> None:
        from datetime import datetime, timezone

        from app.services.realtime_events import emit_training_eligibility_updated

        emit_training_eligibility_updated(
            tenant_id="t1",
            project_id="p1",
            run_id="run-1",
            dataset_id="ds1",
            status="blocked",
            ready=False,
            updated_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            trace_id="tr",
        )
        self.assertEqual(mock_pub.call_count, 2)
        self.assertEqual(mock_pub.call_args_list[0].args[0]["type"], "training.eligibility.updated")
        self.assertEqual(mock_pub.call_args_list[1].args[0]["type"], "eligibility.updated")
        self.assertEqual(mock_pub.call_args_list[1].args[0]["payload"]["kind"], "training")

    @patch("app.services.realtime_events.publish_mlair_event")
    def test_emit_model_eligibility_dual_publish(self, mock_pub: MagicMock) -> None:
        from datetime import datetime, timezone

        from app.services.realtime_events import emit_model_eligibility_updated

        emit_model_eligibility_updated(
            tenant_id="t1",
            project_id="p1",
            model_id="m1",
            action="approval_updated",
            updated_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
            trace_id="tr",
            version=2,
        )
        self.assertEqual(mock_pub.call_count, 2)
        self.assertEqual(mock_pub.call_args_list[0].args[0]["type"], "model.eligibility.updated")
        self.assertEqual(mock_pub.call_args_list[1].args[0]["type"], "eligibility.updated")
        self.assertEqual(mock_pub.call_args_list[1].args[0]["payload"]["kind"], "model")


if __name__ == "__main__":
    unittest.main()
