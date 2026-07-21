"""Bootstrap scope catalog for global admin Hub scope switcher."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.governance.scope_context_service import list_catalog_accessible_scopes


class TestCatalogAccessibleScopes(unittest.TestCase):
    @patch("app.domains.governance.scope_context_service.list_projects")
    @patch("app.domains.governance.scope_context_service.list_tenants")
    def test_lists_all_tenant_project_pairs(self, mock_tenants, mock_projects) -> None:
        mock_tenants.return_value = [
            {"tenant_id": "default", "name": "default"},
            {"tenant_id": "yolo", "name": "yolo"},
            {"tenant_id": "Clinic", "name": "Clinic"},
        ]

        def projects_for(tenant_id: str, limit: int = 500) -> list[dict[str, str]]:
            mapping = {
                "default": [{"project_id": "default_project", "name": "default_project"}],
                "yolo": [{"project_id": "yoloVN", "name": "YOLO Vietnam"}],
                "Clinic": [{"project_id": "ClinicVN", "name": "Clinic Vietnam"}],
            }
            return mapping.get(tenant_id, [])

        mock_projects.side_effect = projects_for
        scopes = list_catalog_accessible_scopes()
        pairs = {(s["tenant_id"], s["project_id"]) for s in scopes}
        self.assertEqual(
            pairs,
            {
                ("default", "default_project"),
                ("yolo", "yoloVN"),
                ("Clinic", "ClinicVN"),
            },
        )
        self.assertTrue(all(s["role"] == "admin" for s in scopes))


if __name__ == "__main__":
    unittest.main()
