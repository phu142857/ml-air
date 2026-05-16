from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

try:
    import psycopg  # type: ignore # noqa: F401
except Exception:
    _psycopg_stub = types.ModuleType("psycopg")
    _psycopg_stub.Connection = object  # type: ignore[attr-defined]
    _psycopg_stub.connect = lambda *args, **kwargs: None  # type: ignore[attr-defined]
    sys.modules["psycopg"] = _psycopg_stub

from app.api.routes import v1
from app.domains.governance import project_service


class TestProjectRegistry(unittest.TestCase):
    def test_register_project_rejects_reserved_id(self) -> None:
        with self.assertRaises(ValueError):
            project_service.register_project("tenant-a", "all")

    @patch("app.domains.governance.project_service.db_conn")
    def test_register_project_inserts(self, mock_db_conn: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.__enter__.return_value = mock_conn
        mock_conn.__exit__.return_value = None
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.cursor.return_value.__exit__.return_value = None
        mock_db_conn.return_value = mock_conn

        out = project_service.register_project("tenant-a", "new_proj", name="Display")
        self.assertEqual(
            out,
            {"tenant_id": "tenant-a", "project_id": "new_proj", "name": "Display"},
        )
        mock_cur.execute.assert_called_once()

    @patch("app.domains.governance.project_service.db_conn")
    def test_list_projects_merges_registry_and_discovery(self, mock_db_conn: MagicMock) -> None:
        """Registry-only project appears alongside discovered IDs; names from registry win."""

        def cm(conn: MagicMock) -> MagicMock:
            m = MagicMock()
            m.__enter__.return_value = conn
            m.__exit__.return_value = None
            return m

        reg_conn = MagicMock()
        reg_cur = MagicMock()

        def reg_exec(query: str, params=None) -> None:
            reg_cur.fetchall.return_value = [("only_in_registry", "Human name")]

        reg_cur.execute.side_effect = reg_exec
        reg_cur_ctx = MagicMock()
        reg_cur_ctx.__enter__.return_value = reg_cur
        reg_cur_ctx.__exit__.return_value = None
        reg_conn.cursor.return_value = reg_cur_ctx

        disc_conn = MagicMock()
        disc_cur = MagicMock()

        def disc_exec(query: str, params=None) -> None:
            if "runs" in str(query):
                disc_cur.fetchall.return_value = [("from_runs",)]
            else:
                disc_cur.fetchall.return_value = []

        disc_cur.execute.side_effect = disc_exec
        disc_cur_ctx = MagicMock()
        disc_cur_ctx.__enter__.return_value = disc_cur
        disc_cur_ctx.__exit__.return_value = None
        disc_conn.cursor.return_value = disc_cur_ctx

        mock_db_conn.side_effect = [cm(reg_conn), cm(disc_conn)]

        items = project_service.list_projects("tenant-x", limit=50)
        ids = [i["project_id"] for i in items]
        self.assertIn("only_in_registry", ids)
        self.assertIn("from_runs", ids)
        by_id = {i["project_id"]: i["name"] for i in items}
        self.assertEqual(by_id["only_in_registry"], "Human name")
        self.assertEqual(by_id["from_runs"], "from_runs")

    @patch("app.api.routes.v1.authenticate_bearer")
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.register_project")
    def test_register_project_v1_success(
        self, mock_reg: MagicMock, _authz: MagicMock, mock_auth: MagicMock
    ) -> None:
        mock_auth.return_value = SimpleNamespace(role="maintainer")
        mock_reg.return_value = {"tenant_id": "t1", "project_id": "p1", "name": "p1"}
        body = v1.RegisterProjectIn(project_id="p1")
        out = v1.register_project_v1("t1", body, authorization="Bearer x")
        self.assertEqual(out["project_id"], "p1")
        mock_reg.assert_called_once_with(tenant_id="t1", project_id="p1", name=None)


if __name__ == "__main__":
    unittest.main()
