"""Unit tests for serving route resolution + champion auto-assign on promote."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.domains.governance.model_registry_service import resolve_model_serving_route


class TestServingRoute(unittest.TestCase):
    def test_resolve_primary_is_champion(self) -> None:
        slots = {
            "slots": [
                {"slot": "champion", "version": 3},
                {"slot": "canary", "version": 4},
                {"slot": "candidate", "version": 2},
            ]
        }
        with (
            patch("app.domains.governance.model_registry_service.db_conn") as db_conn,
            patch(
                "app.domains.governance.model_registry_service.list_model_serving_slots",
                return_value=slots,
            ),
        ):
            conn = MagicMock()
            cur = MagicMock()
            cur.fetchone.return_value = ("m1", "detector")
            conn.cursor.return_value.__enter__.return_value = cur
            db_conn.return_value.__enter__.return_value = conn
            out = resolve_model_serving_route("t1", "p1", "m1")
        self.assertEqual(out["primary"]["version"], 3)
        self.assertEqual(out["canary"]["version"], 4)
        self.assertEqual(out["model_name"], "detector")

    def test_resolve_missing_model(self) -> None:
        with patch("app.domains.governance.model_registry_service.db_conn") as db_conn:
            conn = MagicMock()
            cur = MagicMock()
            cur.fetchone.return_value = None
            conn.cursor.return_value.__enter__.return_value = cur
            db_conn.return_value.__enter__.return_value = conn
            with self.assertRaises(ValueError) as ctx:
                resolve_model_serving_route("t1", "p1", "missing")
        self.assertEqual(str(ctx.exception), "model_not_found")


if __name__ == "__main__":
    unittest.main()
