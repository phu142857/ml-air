"""Unit tests for list_run_usage_samples."""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

if "psycopg" not in sys.modules:
    sys.modules["psycopg"] = MagicMock()

from sdk.usage_cost import list_run_usage_samples


class ListRunUsageSamplesTests(unittest.TestCase):
    @patch("sdk.usage_cost.usage_tracking_enabled", return_value=False)
    def test_disabled_returns_empty(self, _enabled: MagicMock) -> None:
        out = list_run_usage_samples(run_id="run-1")
        self.assertFalse(out["enabled"])
        self.assertEqual(out["samples"], [])

    @patch("sdk.usage_cost.connect")
    @patch("sdk.usage_cost.usage_tracking_enabled", return_value=True)
    @patch("sdk.usage_cost._db_url", return_value="postgresql://x")
    def test_lists_samples_for_run(self, _url: MagicMock, _enabled: MagicMock, mock_connect: MagicMock) -> None:
        cur = MagicMock()
        cur.fetchall.return_value = [
            (1, "task-a", datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc), 12.5, 256.0, 80.0, 1024.0),
            (2, "task-a", datetime(2026, 6, 1, 10, 0, 1, tzinfo=timezone.utc), 20.0, 300.0, 90.0, 1100.0),
        ]
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        mock_connect.return_value.__enter__.return_value = conn

        out = list_run_usage_samples(run_id="run-1", limit=500)
        self.assertTrue(out["enabled"])
        self.assertEqual(out["count"], 2)
        self.assertEqual(out["samples"][0]["task_id"], "task-a")
        self.assertEqual(out["samples"][1]["gpu_util_percent"], 90.0)
        self.assertIsNone(out["next_cursor"])

    @patch("sdk.usage_cost.connect")
    @patch("sdk.usage_cost.usage_tracking_enabled", return_value=True)
    @patch("sdk.usage_cost._db_url", return_value="postgresql://x")
    def test_pagination_cursor(self, _url: MagicMock, _enabled: MagicMock, mock_connect: MagicMock) -> None:
        cur = MagicMock()
        cur.fetchall.return_value = [
            (10, "task-a", datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc), 1.0, 1.0, None, None),
            (11, "task-a", datetime(2026, 6, 1, 10, 0, 1, tzinfo=timezone.utc), 2.0, 2.0, None, None),
            (12, "task-a", datetime(2026, 6, 1, 10, 0, 2, tzinfo=timezone.utc), 3.0, 3.0, None, None),
        ]
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        mock_connect.return_value.__enter__.return_value = conn

        out = list_run_usage_samples(run_id="run-1", limit=2, cursor="9")
        self.assertEqual(out["count"], 2)
        self.assertEqual(out["next_cursor"], "11")
        sql = cur.execute.call_args[0][0]
        self.assertIn("s.id > %s", sql)
        self.assertEqual(cur.execute.call_args[0][1], ("run-1", 9, 3))


if __name__ == "__main__":
    unittest.main()
