from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.governance.identity_password import hash_password, verify_password
from app.domains.governance.identity_service import _assignment_key, replace_user_assignments
from app.domains.governance.identity_token_service import issue_access_token, decode_identity_access_token


class TestIdentityPassword(unittest.TestCase):
    def test_hash_and_verify(self) -> None:
        stored = hash_password("secret-pass")
        self.assertTrue(verify_password("secret-pass", stored))
        self.assertFalse(verify_password("wrong", stored))


class TestIdentityToken(unittest.TestCase):
    def test_issue_and_decode_access_token(self) -> None:
        token, ttl = issue_access_token(user_id="usr_1", username="alice", is_global_admin=False)
        self.assertGreater(ttl, 0)
        payload = decode_identity_access_token(token)
        self.assertEqual(payload["sub"], "usr_1")
        self.assertEqual(payload["principal_type"], "USER")


class TestAssignmentKey(unittest.TestCase):
    def test_assignment_key_stable(self) -> None:
        a = _assignment_key("t1", "viewer", False, ["p2", "p1"])
        b = _assignment_key("t1", "viewer", False, ["p1", "p2"])
        self.assertEqual(a, b)


class TestReplaceAssignmentsValidation(unittest.TestCase):
    @patch("app.domains.governance.identity_service.repo.delete_assignments_for_user")
    @patch("app.domains.governance.identity_service.repo.insert_assignment")
    @patch("app.domains.governance.identity_service.list_assignments_for_user", return_value=[])
    def test_replace_inserts_rows(self, _list, mock_insert, _delete) -> None:
        mock_insert.return_value = {"id": "ura_1"}
        out = replace_user_assignments(
            "usr_1",
            [
                {
                    "tenant_id": "default",
                    "role": "maintainer",
                    "all_projects": True,
                    "project_ids": [],
                }
            ],
        )
        self.assertEqual(len(out), 1)
        mock_insert.assert_called_once()


if __name__ == "__main__":
    unittest.main()
