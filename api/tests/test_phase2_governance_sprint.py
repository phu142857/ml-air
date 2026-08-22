"""Unit tests for Phase II governance."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.governance.process_rbac_service import authorize_model_process_action
from app.domains.governance.auth_service import Principal
from fastapi import HTTPException


class TestProcessRbac(unittest.TestCase):
    def _principal(self, **kwargs) -> Principal:
        base = dict(
            token="t",
            subject="u1",
            token_issuer="mlair",
            scope_mapping_version=1,
            role="viewer",
            tenant_id="default",
            project_ids=["default_project"],
            principal_kind="user",
            user_id="user-1",
        )
        base.update(kwargs)
        return Principal(**base)

    @patch("app.domains.governance.process_rbac_service._effective_scope_role", return_value="maintainer")
    @patch("app.domains.governance.model_stakeholder_service.user_is_executor_stakeholder", return_value=True)
    def test_executor_cannot_final_approve(self, *_mocks) -> None:
        p = self._principal()
        with self.assertRaises(HTTPException) as ctx:
            authorize_model_process_action(
                p,
                tenant_id="default",
                project_id="default_project",
                model_id="m1",
                action="model.approve",
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "separation_of_duties_executor_cannot_approve")

    @patch("app.domains.governance.process_rbac_service._effective_scope_role", return_value="maintainer")
    @patch("app.domains.governance.model_stakeholder_service.user_is_executor_stakeholder", return_value=False)
    def test_maintainer_can_approve(self, *_mocks) -> None:
        p = self._principal()
        authorize_model_process_action(
            p,
            tenant_id="default",
            project_id="default_project",
            model_id="m1",
            action="model.approve",
        )


if __name__ == "__main__":
    unittest.main()
