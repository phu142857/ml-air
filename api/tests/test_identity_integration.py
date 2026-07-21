from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.domains.governance import identity_service as svc
from app.domains.governance.identity_password import hash_password, verify_password


class TestIdentityLoginFlow(unittest.TestCase):
    @patch("app.domains.governance.identity_service.repo.insert_audit_event")
    @patch("app.domains.governance.identity_service.repo.insert_session")
    @patch("app.domains.governance.identity_service.repo.update_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_username")
    def test_login_success(self, mock_get_user, mock_update, mock_insert_session, _audit) -> None:
        pw_hash = hash_password("good-pass")
        mock_get_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "password_hash": pw_hash,
            "state": "active",
            "is_global_admin": False,
            "failed_login_count": 0,
            "locked_until": None,
        }
        mock_insert_session.return_value = {"id": "ses_1"}
        out = svc.login(username="alice", password="good-pass", ip=None, user_agent=None)
        self.assertIn("access_token", out)
        self.assertIn("refresh_token", out)
        mock_update.assert_called()

    @patch("app.domains.governance.identity_service.repo.insert_audit_event")
    @patch("app.domains.governance.identity_service.repo.get_user_by_username")
    def test_login_bad_password(self, mock_get_user, _audit) -> None:
        mock_get_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "password_hash": hash_password("good-pass"),
            "state": "active",
            "is_global_admin": False,
            "failed_login_count": 0,
            "locked_until": None,
        }
        with self.assertRaises(Exception):
            svc.login(username="alice", password="wrong", ip=None, user_agent=None)

    @patch("app.domains.governance.identity_service.repo.insert_audit_event")
    @patch("app.domains.governance.identity_service.repo.get_user_by_username")
    def test_login_locked_account_returns_423(self, mock_get_user, _audit) -> None:
        locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
        mock_get_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "password_hash": hash_password("good-pass"),
            "state": "locked",
            "is_global_admin": False,
            "failed_login_count": 5,
            "locked_until": locked_until,
        }
        with self.assertRaises(HTTPException) as ctx:
            svc.login(username="alice", password="good-pass", ip=None, user_agent=None)
        self.assertEqual(ctx.exception.status_code, 423)


class TestAuthorizeUserScope(unittest.TestCase):
    @patch("app.domains.governance.identity_service.repo.list_assignments_for_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    def test_maintainer_can_mutate_in_scope(self, mock_get_user, mock_assignments) -> None:
        mock_get_user.return_value = {
            "id": "usr_1",
            "is_global_admin": False,
            "state": "active",
        }
        mock_assignments.return_value = [
            {
                "tenant_id": "default",
                "role": "maintainer",
                "all_projects": True,
                "project_ids": [],
            }
        ]
        with patch("app.domains.governance.identity_service.list_projects", return_value=[{"project_id": "default_project"}]):
            role = svc.authorize_user_scope("usr_1", "default", "default_project", "maintainer")
        self.assertEqual(role, "maintainer")

    @patch("app.domains.governance.identity_service.repo.list_assignments_for_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    def test_viewer_denied_maintainer_action(self, mock_get_user, mock_assignments) -> None:
        mock_get_user.return_value = {
            "id": "usr_1",
            "is_global_admin": False,
            "state": "active",
        }
        mock_assignments.return_value = [
            {
                "tenant_id": "default",
                "role": "viewer",
                "all_projects": True,
                "project_ids": [],
            }
        ]
        with patch("app.domains.governance.identity_service.list_projects", return_value=[{"project_id": "default_project"}]):
            with self.assertRaises(HTTPException) as ctx:
                svc.authorize_user_scope("usr_1", "default", "default_project", "maintainer")
        self.assertEqual(ctx.exception.status_code, 403)


class TestAuthorizeServiceAccountScope(unittest.TestCase):
    @patch("app.domains.governance.identity_service.repo.list_sa_permissions")
    @patch("app.domains.governance.identity_service.repo.list_sa_scopes")
    def test_platform_sa_maintainer_in_scope(self, mock_scopes, mock_perms) -> None:
        mock_scopes.return_value = [
            {"tenant_id": "default", "all_projects": True, "project_ids": []},
        ]
        mock_perms.return_value = sorted(svc.PLATFORM_SA_PERMISSIONS)
        role = svc.authorize_service_account_scope("sa_1", "default", "default_project", "maintainer")
        self.assertEqual(role, "maintainer")

    @patch("app.domains.governance.identity_service.repo.list_sa_permissions")
    @patch("app.domains.governance.identity_service.repo.list_sa_scopes")
    def test_worker_sa_denied_product_api(self, mock_scopes, mock_perms) -> None:
        mock_scopes.return_value = [
            {"tenant_id": "default", "all_projects": True, "project_ids": []},
        ]
        mock_perms.return_value = ["tasks:lease", "tasks:heartbeat", "tasks:complete", "tasks:fail"]
        with self.assertRaises(HTTPException) as ctx:
            svc.authorize_service_account_scope("sa_worker", "default", "default_project", "maintainer")
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
