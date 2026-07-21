"""Run/task log stream helpers."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.domains.orchestration import log_service as logs


class TestLogService(unittest.TestCase):
    @patch("app.domains.orchestration.log_service.append_log_entry")
    @patch("app.domains.orchestration.log_service.get_trace_id", return_value="trace-1")
    def test_append_task_run_log_persists_and_indexes_task(
        self, _mock_trace: MagicMock, mock_append: MagicMock
    ) -> None:
        logs.append_task_run_log(
            "run-1",
            task_id="run-1:train",
            level="INFO",
            message="epoch 1",
            plugin="app_train_adapter",
            worker_id="w-1",
        )

        mock_append.assert_called_once()
        kwargs = mock_append.call_args.kwargs
        self.assertEqual(kwargs["run_id"], "run-1")
        self.assertEqual(kwargs["task_id"], "run-1:train")
        self.assertEqual(kwargs["message"], "epoch 1")
        self.assertEqual(kwargs["payload"]["task_id"], "run-1:train")
        self.assertEqual(kwargs["payload"]["plugin"], "app_train_adapter")
        self.assertEqual(kwargs["payload"]["worker_id"], "w-1")

    @patch("app.domains.orchestration.log_service.db_conn")
    def test_read_task_logs_from_postgres(self, mock_db: MagicMock) -> None:
        conn = MagicMock()
        cur = MagicMock()
        mock_db.return_value.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        cur.fetchall.return_value = [
            (
                1,
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                "INFO",
                "ok",
                "trace-1",
                {"task_id": "t1"},
            )
        ]

        items = logs.read_task_logs("t1", offset=0, limit=10)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["payload"]["task_id"], "t1")
        self.assertEqual(items[0]["message"], "ok")

    @patch("app.domains.orchestration.log_service.db_conn")
    def test_read_run_logs_page_tail_returns_newest_chunk(self, mock_db: MagicMock) -> None:
        conn = MagicMock()
        cur = MagicMock()
        mock_db.return_value.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        rows = [
            (
                i,
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                "INFO",
                f"line {i}",
                None,
                {},
            )
            for i in (4, 3, 2)
        ]
        cur.fetchall.return_value = rows
        cur.fetchone.return_value = (False,)

        page = logs.read_run_logs_page("run-1", limit=3, tail=True)
        self.assertEqual(len(page.items), 3)
        self.assertEqual(page.items[0]["message"], "line 2")
        self.assertEqual(page.items[-1]["message"], "line 4")

    @patch("app.domains.orchestration.log_service.db_conn")
    def test_read_run_logs_page_tail_cursor_loads_older(self, mock_db: MagicMock) -> None:
        from app.domains.shared.pagination import encode_cursor

        conn = MagicMock()
        cur = MagicMock()
        mock_db.return_value.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        rows = [
            (
                i,
                datetime(2026, 1, 1, tzinfo=timezone.utc),
                "INFO",
                f"line {i}",
                None,
                {},
            )
            for i in (1, 0)
        ]
        cur.fetchall.return_value = rows
        cur.fetchone.return_value = (False,)

        cursor = encode_cursor({"dir": "before", "sequence": 2})
        page = logs.read_run_logs_page("run-1", limit=3, tail=True, cursor=cursor)
        self.assertEqual(len(page.items), 2)
        self.assertEqual(page.items[0]["message"], "line 0")
        self.assertFalse(page.has_more)

    def test_task_log_payload(self) -> None:
        pl = logs.task_log_payload(task_id="abc", plugin="p", worker_id="w")
        self.assertEqual(pl, {"task_id": "abc", "plugin": "p", "worker_id": "w"})


if __name__ == "__main__":
    unittest.main()
