"""Phase 4: Redis Streams durable bus."""

from __future__ import annotations

import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

if "redis" not in sys.modules:
    sys.modules["redis"] = MagicMock()

from app.domains.observability import event_stream_service as stream


class TestEventStreamService(unittest.TestCase):
    def test_stream_enabled_when_env_on(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_EVENT_STREAM": "1"}, clear=False):
            self.assertTrue(stream.stream_enabled())

    @patch.dict(os.environ, {"ML_AIR_EVENT_STREAM": "0"}, clear=False)
    def test_stream_disabled_when_env_off(self) -> None:
        self.assertFalse(stream.stream_enabled())

    @patch.object(stream, "_worker_settings", return_value=None)
    @patch.dict(
        os.environ,
        {"ML_AIR_EVENT_STREAM": "1", "ML_AIR_EVENT_STREAM_GLOBAL_FANOUT": "0"},
        clear=False,
    )
    @patch("app.domains.shared.queue_service.redis_client")
    def test_append_scope_stream(self, mock_redis: MagicMock, _mock_ws: MagicMock) -> None:
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
