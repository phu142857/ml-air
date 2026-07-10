"""Run log retention purge."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.domains.orchestration import run_log_retention_service as svc


class TestRunLogRetentionService(unittest.TestCase):
    @patch.dict("os.environ", {"ML_AIR_RUN_LOG_RETENTION_ENABLED": "0"})
    def test_purge_disabled(self) -> None:
        self.assertEqual(svc.purge_expired_run_logs(), 0)

    @patch("app.domains.orchestration.run_log_retention_service.db_conn")
    @patch.dict("os.environ", {"ML_AIR_RUN_LOG_RETENTION_ENABLED": "1", "ML_AIR_RUN_LOG_RETENTION_DAYS": "30"})
    def test_purge_deletes_old_rows(self, mock_db: MagicMock) -> None:
        conn = MagicMock()
        cur = MagicMock()
        mock_db.return_value.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        cur.rowcount = 42

        deleted = svc.purge_expired_run_logs()
        self.assertEqual(deleted, 42)
        cur.execute.assert_called_once()


if __name__ == "__main__":
    unittest.main()
