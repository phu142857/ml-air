"""Scope list APIs filter by principal access."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.domains.governance.auth_service import Principal
from app.domains.governance.scope_context_service import (
    accessible_scopes_for_principal,
    list_accessible_projects_for_principal,
    list_accessible_tenants_for_principal,
    principal_has_tenant_access,
)


class TestAccessibleScopesForPrincipal(unittest.TestCase):
    def test_legacy_viewer_single_project(self) -> None:
        principal = Principal(
            token="t",
            subject="sub",
            token_issuer="static",
            scope_mapping_version=1,
            role="viewer",
            tenant_id="acme",
            project_ids=["proj_a"],
        )
        scopes = accessible_scopes_for_principal(principal)
        self.assertEqual(scopes, [{"tenant_id": "acme", "project_id": "proj_a", "role": "viewer"}])

    @patch("app.domains.governance.scope_context_service.list_projects")
    def test_legacy_wildcard_projects_in_tenant(self, mock_projects: MagicMock) -> None:
        mock_projects.return_value = [
            {"project_id": "p1", "name": "p1"},
            {"project_id": "p2", "name": "p2"},
        ]
        principal = Principal(
            token="t",
            subject="sub",
            token_issuer="static",
            scope_mapping_version=1,
            role="maintainer",
            tenant_id="acme",
            project_ids=["*"],
        )
        scopes = accessible_scopes_for_principal(principal)
        pairs = {(s["tenant_id"], s["project_id"]) for s in scopes}
        self.assertEqual(pairs, {("acme", "p1"), ("acme", "p2")})

    @patch("app.domains.governance.scope_context_service.list_catalog_accessible_scopes")
    def test_legacy_admin_catalog_wide(self, mock_catalog: MagicMock) -> None:
        mock_catalog.return_value = [{"tenant_id": "t1", "project_id": "p1", "role": "admin"}]
        principal = Principal(
            token="t",
            subject="sub",
            token_issuer="static",
            scope_mapping_version=1,
            role="admin",
            tenant_id="default",
            project_ids=["*"],
        )
        scopes = accessible_scopes_for_principal(principal)
        self.assertEqual(scopes, mock_catalog.return_value)
        mock_catalog.assert_called_once()

    @patch("app.domains.governance.scope_context_service.accessible_scopes_for_principal")
    def test_list_tenants_filtered(self, mock_scopes: MagicMock) -> None:
        mock_scopes.return_value = [
            {"tenant_id": "a", "project_id": "p1", "role": "viewer"},
            {"tenant_id": "b", "project_id": "p2", "role": "viewer"},
        ]
        principal = MagicMock()
        items = list_accessible_tenants_for_principal(principal)
        self.assertEqual([i["tenant_id"] for i in items], ["a", "b"])

    @patch("app.domains.governance.scope_context_service.accessible_scopes_for_principal")
    @patch("app.domains.governance.scope_context_service.list_projects")
    def test_list_projects_filtered(self, mock_list_projects: MagicMock, mock_scopes: MagicMock) -> None:
        mock_scopes.return_value = [
            {"tenant_id": "acme", "project_id": "allowed", "role": "viewer"},
            {"tenant_id": "acme", "project_id": "other", "role": "viewer"},
            {"tenant_id": "other", "project_id": "x", "role": "viewer"},
        ]
        mock_list_projects.return_value = [
            {"project_id": "allowed", "name": "Allowed"},
            {"project_id": "secret", "name": "Secret"},
        ]
        principal = MagicMock()
        items = list_accessible_projects_for_principal(principal, "acme")
        pids = [i["project_id"] for i in items]
        self.assertEqual(pids, ["allowed", "other"])
        self.assertNotIn("secret", pids)

    @patch("app.domains.governance.scope_context_service.accessible_scopes_for_principal")
    def test_principal_has_tenant_access(self, mock_scopes: MagicMock) -> None:
        mock_scopes.return_value = [{"tenant_id": "acme", "project_id": "p1", "role": "viewer"}]
        principal = MagicMock()
        self.assertTrue(principal_has_tenant_access(principal, "acme"))
        self.assertFalse(principal_has_tenant_access(principal, "other"))


if __name__ == "__main__":
    unittest.main()
