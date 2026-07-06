"""Run/task log stream helpers."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from app.domains.orchestration import log_service as logs


class TestLogService(unittest.TestCase):
    @patch("app.domains.orchestration.log_service.redis_client")
    def test_append_task_run_log_dual_index(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client

        logs.append_task_run_log(
            "run-1",
            task_id="run-1:train",
            level="INFO",
            message="epoch 1",
            plugin="app_train_adapter",
            worker_id="w-1",
        )

        self.assertEqual(client.rpush.call_count, 2)
        run_key = client.rpush.call_args_list[0][0][0]
        task_key = client.rpush.call_args_list[1][0][0]
        self.assertEqual(run_key, "mlair:logs:run-1")
        self.assertEqual(task_key, "mlair:tasklogs:run-1:train")

        entry = json.loads(client.rpush.call_args_list[0][0][1])
        self.assertEqual(entry["message"], "epoch 1")
        self.assertEqual(entry["payload"]["task_id"], "run-1:train")
        self.assertEqual(entry["payload"]["plugin"], "app_train_adapter")
        self.assertEqual(entry["payload"]["worker_id"], "w-1")

    @patch("app.domains.orchestration.log_service.redis_client")
    def test_read_task_logs(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        line = json.dumps(
            {
                "ts": "2026-01-01T00:00:00+00:00",
                "level": "INFO",
                "message": "ok",
                "payload": {"task_id": "t1"},
            }
        )
        client.lrange.return_value = [line.encode() if isinstance(line, str) else line]

        items = logs.read_task_logs("t1", offset=0, limit=10)
        client.lrange.assert_called_once_with("mlair:tasklogs:t1", 0, 9)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["payload"]["task_id"], "t1")

    @patch("app.domains.orchestration.log_service.redis_client")
    def test_read_task_logs_falls_back_to_run_stream(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        run_line = json.dumps(
            {
                "ts": "2026-01-01T00:00:00+00:00",
                "level": "INFO",
                "message": "task finished",
                "payload": {"task_id": "t1"},
            }
        )
        other_line = json.dumps(
            {
                "ts": "2026-01-01T00:00:01+00:00",
                "level": "INFO",
                "message": "other task",
                "payload": {"task_id": "t2"},
            }
        )

        def lrange_side_effect(key: str, start: int, end: int):
            if key == "mlair:tasklogs:t1":
                return []
            if key == "mlair:logs:run-1":
                return [run_line, other_line]
            return []

        client.lrange.side_effect = lrange_side_effect

        page = logs.read_task_logs_page("t1", run_id="run-1", limit=10)
        self.assertEqual(len(page.items), 1)
        self.assertEqual(page.items[0]["message"], "task finished")

    def test_task_log_payload(self) -> None:
        pl = logs.task_log_payload(task_id="abc", plugin="p", worker_id="w")
        self.assertEqual(pl, {"task_id": "abc", "plugin": "p", "worker_id": "w"})


if __name__ == "__main__":
    unittest.main()
