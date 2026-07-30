from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
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


class TestMfaFlow(unittest.TestCase):
    @patch("app.domains.governance.identity_service._create_mfa_challenge", return_value="challenge_123")
    @patch("app.domains.governance.identity_service.repo.get_active_totp_for_user")
    @patch("app.domains.governance.identity_service.repo.update_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_username")
    def test_login_requires_mfa_when_totp_enabled(
        self,
        mock_get_user,
        _mock_update,
        mock_get_totp,
        _mock_challenge,
    ) -> None:
        mock_get_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "password_hash": hash_password("pass-123456"),
            "state": "active",
            "is_global_admin": False,
            "failed_login_count": 0,
        }
        mock_get_totp.return_value = {"id": "mfa_1", "secret_ciphertext": "enc"}
        out = svc.login(username="alice", password="pass-123456", ip="127.0.0.1", user_agent="pytest")
        self.assertTrue(out.get("mfa_required"))
        self.assertEqual(out.get("challenge_token"), "challenge_123")
        self.assertNotIn("access_token", out)

    @patch("app.domains.governance.identity_service._issue_user_session_tokens")
    @patch("app.domains.governance.identity_service._mfa_allow_attempt", return_value=True)
    @patch("app.domains.governance.identity_service.repo.consume_recovery_code", return_value=True)
    @patch("app.domains.governance.identity_service.repo.get_active_totp_for_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    @patch("app.domains.governance.identity_service.repo.consume_open_mfa_challenge")
    def test_complete_mfa_login_with_recovery_code(
        self,
        mock_challenge,
        mock_user,
        mock_totp,
        _mock_consume_code,
        _mock_allow,
        mock_issue_tokens,
    ) -> None:
        mock_challenge.return_value = {"id": "mfac_1", "user_id": "usr_1"}
        mock_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "state": "active",
            "is_global_admin": False,
        }
        mock_totp.return_value = {"id": "mfa_1", "secret_ciphertext": "enc"}
        mock_issue_tokens.return_value = {"access_token": "a", "refresh_token": "r", "user": {"username": "alice"}}
        out = svc.complete_mfa_login(
            challenge_token="challenge_123",
            otp_code=None,
            recovery_code="ABCD-1234",
            ip="127.0.0.1",
            user_agent="pytest",
        )
        self.assertEqual(out["access_token"], "a")
        self.assertEqual(out["refresh_token"], "r")

    @patch("app.domains.governance.identity_service._mfa_allow_attempt", return_value=False)
    @patch("app.domains.governance.identity_service.repo.get_active_totp_for_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    @patch("app.domains.governance.identity_service.repo.consume_open_mfa_challenge")
    def test_complete_mfa_login_rate_limited(
        self,
        mock_challenge,
        mock_user,
        mock_totp,
        _mock_allow,
    ) -> None:
        mock_challenge.return_value = {"id": "mfac_1", "user_id": "usr_1"}
        mock_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "state": "active",
            "is_global_admin": False,
        }
        mock_totp.return_value = {"id": "mfa_1", "secret_ciphertext": "enc"}
        with self.assertRaises(HTTPException) as ctx:
            svc.complete_mfa_login(
                challenge_token="challenge_123",
                otp_code="123456",
                recovery_code=None,
                ip="127.0.0.1",
                user_agent="pytest",
            )
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("Too many MFA attempts", str(ctx.exception.detail))

    @patch("app.domains.governance.identity_service._mfa_allow_challenge_attempt", return_value=False)
    @patch("app.domains.governance.identity_service.repo.get_active_totp_for_user")
    @patch("app.domains.governance.identity_service.repo.get_user_by_id")
    @patch("app.domains.governance.identity_service.repo.consume_open_mfa_challenge")
    def test_complete_mfa_login_challenge_rate_limited(
        self,
        mock_challenge,
        mock_user,
        mock_totp,
        _mock_allow_challenge,
    ) -> None:
        mock_challenge.return_value = {"id": "mfac_1", "user_id": "usr_1"}
        mock_user.return_value = {
            "id": "usr_1",
            "username": "alice",
            "state": "active",
            "is_global_admin": False,
        }
        mock_totp.return_value = {"id": "mfa_1", "secret_ciphertext": "enc"}
        with self.assertRaises(HTTPException) as ctx:
            svc.complete_mfa_login(
                challenge_token="challenge_123",
                otp_code="123456",
                recovery_code=None,
                ip="127.0.0.1",
                user_agent="pytest",
            )
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("Too many MFA attempts for this challenge", str(ctx.exception.detail))


if __name__ == "__main__":
    unittest.main()
