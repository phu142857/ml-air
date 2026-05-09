from __future__ import annotations

import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

# Allow running tests without psycopg/redis installed in lightweight environments.
try:
    import psycopg  # type: ignore # noqa: F401
except Exception:
    _psycopg_stub = types.ModuleType("psycopg")
    _psycopg_stub.Connection = object  # type: ignore[attr-defined]
    _psycopg_stub.connect = lambda *args, **kwargs: None  # type: ignore[attr-defined]
    sys.modules["psycopg"] = _psycopg_stub
try:
    import redis  # type: ignore # noqa: F401
except Exception:
    _redis_stub = types.ModuleType("redis")
    _redis_stub.Redis = object  # type: ignore[attr-defined]
    sys.modules["redis"] = _redis_stub

from app.api.routes import v1


class TestScopeContextPhase3(unittest.TestCase):
    @patch("app.api.routes.v1.scope_context_service.upsert_scope_override")
    @patch("app.api.routes.v1.scope_context_service.resolve_mapping_version", return_value=42)
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_switch_context_success(self, mock_auth, _authz, _resolve, mock_upsert) -> None:
        mock_auth.return_value = SimpleNamespace(subject="user-1")
        payload = v1.ScopeSwitchIn(tenant_id="default", project_id="default_project")
        out = v1.switch_context_v1(payload, authorization="Bearer maintainer-token")
        self.assertTrue(out["ok"])
        self.assertEqual(out["effective_scope"]["mapping_version"], 42)
        mock_upsert.assert_called_once_with(
            subject="user-1",
            tenant_id="default",
            project_id="default_project",
            mapping_version=42,
        )

    @patch("app.api.routes.v1.scope_context_service.resolve_mapping_version", return_value=99)
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_switch_context_rejects_stale_mapping_version(self, mock_auth, _authz, _resolve) -> None:
        mock_auth.return_value = SimpleNamespace(subject="user-1")
        payload = v1.ScopeSwitchIn(
            tenant_id="default",
            project_id="default_project",
            expected_mapping_version=1,
        )
        with self.assertRaises(HTTPException) as ctx:
            v1.switch_context_v1(payload, authorization="Bearer maintainer-token")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, "mapping_version_stale")

    @patch("app.api.routes.v1.scope_context_service.delete_scope_override", return_value=True)
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_clear_context_switch(self, mock_auth, _delete) -> None:
        mock_auth.return_value = SimpleNamespace(subject="user-2")
        out = v1.clear_context_switch_v1(authorization="Bearer maintainer-token")
        self.assertEqual(out, {"ok": True, "cleared": True})

    @patch("app.api.routes.v1.scope_context_service.get_scope_override", return_value={"subject": "user-3"})
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_admin_can_inspect_scope_context(self, mock_auth, _get_override) -> None:
        mock_auth.return_value = SimpleNamespace(role="admin")
        out = v1.get_scope_context_by_subject_v1("user-3", authorization="Bearer admin-token")
        self.assertEqual(out["subject"], "user-3")
        self.assertTrue(out["override_active"])

    @patch("app.api.routes.v1.authenticate_bearer")
    def test_non_admin_cannot_inspect_scope_context(self, mock_auth) -> None:
        mock_auth.return_value = SimpleNamespace(role="maintainer")
        with self.assertRaises(HTTPException) as ctx:
            v1.get_scope_context_by_subject_v1("user-3", authorization="Bearer maintainer-token")
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
