"""Phase 3: monotonic sequence + Redis replay buffer."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from app.domains.observability import event_sequence_service as seq


class TestEventSequenceService(unittest.TestCase):
    @patch("app.domains.shared.queue_service.redis_client")
    def test_assign_sequence_and_buffer(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        client.incr.return_value = 42
        pipe = MagicMock()
        client.pipeline.return_value = pipe

        ev = {
            "version": "v1",
            "event_id": "e1",
            "type": "run.updated",
            "tenant_id": "t1",
            "project_id": "p1",
            "resource_id": "run-1",
            "timestamp": 1.0,
            "payload": {},
        }
        out = seq.assign_sequence_and_buffer(ev)
        self.assertEqual(out["sequence"], 42)
        client.incr.assert_called_once_with("mlair.events.seq.t1.p1")
        pipe.lpush.assert_called_once()
        pipe.ltrim.assert_called_once()
        pipe.execute.assert_called_once()

    @patch("app.domains.shared.queue_service.redis_client")
    def test_list_replay_after_filters_and_sorts(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        e1 = json.dumps({"sequence": 2, "type": "run.updated"})
        e2 = json.dumps({"sequence": 5, "type": "task.updated"})
        e3 = json.dumps({"sequence": 1, "type": "run.created"})
        client.lrange.return_value = [e2, e1, e3]

        items = seq.list_replay_after("t1", "p1", after_sequence=2, limit=10)
        self.assertEqual([i["sequence"] for i in items], [5])

    @patch("app.domains.shared.queue_service.redis_client")
    def test_list_replay_after_returns_multiple_in_order(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        rows = [
            json.dumps({"sequence": 10, "type": "a"}),
            json.dumps({"sequence": 3, "type": "b"}),
            json.dumps({"sequence": 7, "type": "c"}),
        ]
        client.lrange.return_value = rows
        items = seq.list_replay_after("t1", "p1", after_sequence=2, limit=10)
        self.assertEqual([i["sequence"] for i in items], [3, 7, 10])
