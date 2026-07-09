"""Tests for trace retention purge."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.domains.observability import trace_retention_service as retention


class TestTraceRetention(unittest.TestCase):
    @patch.dict("os.environ", {"ML_AIR_TRACE_SPAN_RETENTION_DAYS": "14"}, clear=False)
    def test_retention_days(self) -> None:
        self.assertEqual(retention.retention_days(), 14)

    @patch("app.domains.observability.trace_retention_service.db_conn")
    def test_purge_expired_spans(self, mock_db_conn: MagicMock) -> None:
        cur = MagicMock()
        cur.rowcount = 3
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        mock_db_conn.return_value.__enter__.return_value = conn
        deleted = retention.purge_expired_spans()
        self.assertEqual(deleted, 3)
        cur.execute.assert_called_once()
