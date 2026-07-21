"""Realtime WebSocket auth delegates to API governance (identity JWT + legacy tokens)."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.domains.governance.identity_token_service import issue_access_token


class RealtimeAuthWsTests(unittest.TestCase):
    def setUp(self) -> None:
        os.environ.setdefault("ML_AIR_IDENTITY_JWT_SECRET", "test-realtime-ws-secret")
        os.environ["ML_AIR_LEGACY_STATIC_TOKENS"] = "0"

    def test_decode_principal_accepts_identity_access_jwt(self) -> None:
        from app.auth_ws import authorize_ws, decode_principal

        token, _ttl = issue_access_token(
            user_id="user-realtime-1",
            username="rt-user",
            is_global_admin=True,
            session_id="ses_rt_1",
        )
        with patch("app.domains.governance.identity_repository.get_user_by_id") as get_user, patch(
            "app.domains.governance.identity_repository.get_session_by_id"
        ) as get_session:
            get_user.return_value = {
                "id": "user-realtime-1",
                "username": "rt-user",
                "state": "active",
                "is_global_admin": True,
            }
            get_session.return_value = {
                "id": "ses_rt_1",
                "user_id": "user-realtime-1",
                "revoked_at": None,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
            }
            principal = decode_principal(token)
            self.assertIsNotNone(principal)
            assert principal is not None
            self.assertEqual(principal.user_id, "user-realtime-1")
            self.assertTrue(authorize_ws(principal, "default", "default_project", "viewer"))

    def test_decode_principal_rejects_garbage_token(self) -> None:
        from app.auth_ws import decode_principal

        self.assertIsNone(decode_principal("not-a-valid-token"))


if __name__ == "__main__":
    unittest.main()
