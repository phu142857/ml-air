"""Phase 4: Redis Streams durable bus."""

from __future__ import annotations

import json
import os
import unittest
from unittest.mock import MagicMock, patch

from app.domains.observability import event_stream_service as stream


class TestEventStreamService(unittest.TestCase):
    def test_stream_disabled_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_EVENT_STREAM", None)
            self.assertFalse(stream.stream_enabled())

    @patch.dict(os.environ, {"ML_AIR_EVENT_STREAM": "1"}, clear=False)
    @patch("app.domains.shared.queue_service.redis_client")
    def test_append_scope_stream(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        ev = {
            "version": "v1",
            "type": "run.updated",
            "tenant_id": "t1",
            "project_id": "p1",
            "sequence": 7,
            "payload": {},
        }
        stream.append_event_streams(ev)
        client.xadd.assert_called_once()
        args, kwargs = client.xadd.call_args
        self.assertEqual(args[0], "mlair.events.stream.t1.p1")
        self.assertIn("maxlen", kwargs)

    @patch.dict(
        os.environ,
        {"ML_AIR_EVENT_STREAM": "1", "ML_AIR_EVENT_STREAM_GLOBAL_FANOUT": "1"},
        clear=False,
    )
    @patch("app.domains.shared.queue_service.redis_client")
    def test_append_global_fanout(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        ev = {
            "type": "task.updated",
            "tenant_id": "t1",
            "project_id": "p1",
            "sequence": 2,
        }
        stream.append_event_streams(ev)
        self.assertEqual(client.xadd.call_count, 2)

    @patch.dict(os.environ, {"ML_AIR_EVENT_STREAM": "1"}, clear=False)
    @patch("app.domains.shared.queue_service.redis_client")
    def test_list_stream_replay_after(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        e1 = ("1-0", {"envelope": json.dumps({"sequence": 3, "type": "a"}), "sequence": "3"})
        e2 = ("2-0", {"envelope": json.dumps({"sequence": 8, "type": "b"}), "sequence": "8"})
        client.xrevrange.return_value = [e2, e1]
        items = stream.list_stream_replay_after("t1", "p1", after_sequence=5, limit=10)
        self.assertEqual([i["sequence"] for i in items], [8])
