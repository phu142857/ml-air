"""Log search and export helpers."""

from __future__ import annotations

import unittest

from app.domains.orchestration.log_service import LogSearchFilters, _filter_sql


class TestLogSearchFilters(unittest.TestCase):
    def test_filter_sql_empty(self) -> None:
        args: list = []
        self.assertEqual(_filter_sql(None, args), "")
        self.assertEqual(args, [])

    def test_filter_sql_message_search(self) -> None:
        args: list = []
        sql = _filter_sql(LogSearchFilters(q="epoch"), args)
        self.assertIn("ILIKE", sql)
        self.assertEqual(len(args), 2)
        self.assertEqual(args[0], "%epoch%")

    def test_filter_sql_level_and_task(self) -> None:
        args: list = []
        sql = _filter_sql(LogSearchFilters(level="error", task_id="t1"), args)
        self.assertIn("level = %s", sql)
        self.assertIn("task_id = %s", sql)
        self.assertEqual(args, ["ERROR", "t1"])


if __name__ == "__main__":
    unittest.main()
