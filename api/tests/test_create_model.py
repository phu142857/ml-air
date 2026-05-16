"""Tests for model registry create_model validation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from app.domains.governance.model_registry_service import create_model


class TestCreateModel(unittest.TestCase):
    @patch("app.domains.governance.model_registry_service.db_conn")
    def test_duplicate_name_raises(self, mock_db_conn: MagicMock) -> None:
        conn = MagicMock()
        cur = MagicMock()
        mock_db_conn.return_value.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        cur.fetchone.return_value = ("existing-id",)

        with self.assertRaises(ValueError) as ctx:
            create_model("default", "default_project", "fraud-detector")
        self.assertEqual(str(ctx.exception), "model_name_exists")

    @patch("app.domains.governance.model_registry_service.db_conn")
    def test_empty_name_raises(self, mock_db_conn: MagicMock) -> None:
        with self.assertRaises(ValueError) as ctx:
            create_model("default", "default_project", "   ")
        self.assertEqual(str(ctx.exception), "model_name_required")
        mock_db_conn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
