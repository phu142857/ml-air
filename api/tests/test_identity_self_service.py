from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.domains.governance import identity_service as svc
from app.domains.governance.identity_password import hash_password, verify_password
from app.domains.governance.identity_token_service import hash_opaque


class TestIdentitySelfService(unittest.TestCase):
    @patch("app.domains.governance.identity_service.repo.update_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    def test_change_password_success(self, mock_get, mock_update) -> None:
        pw = hash_password("old-pass-12")
        mock_get.return_value = {"id": "usr_1", "password_hash": pw}
        svc.change_password(user_id="usr_1", current_password="old-pass-12", new_password="new-pass-12")
        mock_update.assert_called_once()
        args, kwargs = mock_update.call_args
        self.assertEqual(args[0], "usr_1")
        self.assertTrue(verify_password("new-pass-12", kwargs["password_hash"]))

    @patch("app.domains.governance.identity_service.repo.update_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    def test_update_me_display_name(self, mock_get, mock_update) -> None:
        mock_get.return_value = {"id": "usr_1", "username": "alice", "state": "active", "is_global_admin": False}
        mock_update.return_value = {
            "id": "usr_1",
            "username": "alice",
            "display_name": "Alice",
            "email": None,
            "state": "active",
            "is_global_admin": False,
            "created_at": None,
            "updated_at": None,
            "last_login_at": None,
        }
        with patch("app.domains.governance.identity_service.list_assignments_for_user", return_value=[]):
            out = svc.update_me(user_id="usr_1", display_name="Alice")
        self.assertEqual(out["display_name"], "Alice")

    @patch("app.domains.governance.identity_service.repo.list_sessions")
    @patch("app.domains.governance.identity_service.repo.get_session_by_refresh_hash")
    def test_list_my_sessions_marks_current(self, mock_by_refresh, mock_list) -> None:
        mock_by_refresh.return_value = {"id": "ses_1", "user_id": "usr_1"}
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        mock_list.return_value = [
            {
                "id": "ses_1",
                "user_id": "usr_1",
                "created_at": None,
                "last_used_at": None,
                "expires_at": future,
                "revoked_at": None,
                "ip": "127.0.0.1",
                "user_agent": "curl",
            }
        ]
        items = svc.list_my_sessions(user_id="usr_1", current_refresh_token="refresh")
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["is_current"])

    @patch("app.domains.governance.identity_service.repo.touch_pat_last_used")
    @patch("app.domains.governance.identity_service.repo.lookup_pat_by_hash")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    def test_authenticate_pat_valid(self, mock_user, mock_lookup, _touch) -> None:
        mock_lookup.return_value = {
            "id": "pat_1",
            "user_id": "usr_1",
            "revoked_at": None,
            "expires_at": None,
        }
        mock_user.return_value = {"id": "usr_1", "state": "active", "is_global_admin": False}
        out = svc.authenticate_pat(f"{svc.PAT_PREFIX}secret")
        self.assertIsNotNone(out)
        self.assertEqual(out["user_id"], "usr_1")

    def test_authenticate_pat_rejects_non_prefix(self) -> None:
        self.assertIsNone(svc.authenticate_pat("not-a-pat"))


if __name__ == "__main__":
    unittest.main()
