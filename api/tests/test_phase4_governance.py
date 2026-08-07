"""Phase 4 governance tests."""

from __future__ import annotations

import unittest
from unittest.mock import patch


class TestEventSchemaRegistry(unittest.TestCase):
    def test_backward_compatible_same_version(self) -> None:
        from app.domains.governance import event_schema_registry_service as schema_svc

        self.assertTrue(schema_svc.is_backward_compatible("RunCreated", 1, 1))

    def test_backward_compatible_missing_target(self) -> None:
        from app.domains.governance import event_schema_registry_service as schema_svc

        with patch.object(schema_svc, "get_schema", return_value=None):
            self.assertFalse(schema_svc.is_backward_compatible("UnknownEvent", 1, 2))


class TestRetentionCategories(unittest.TestCase):
    def test_categories_defined(self) -> None:
        from app.domains.governance.event_retention_service import RETENTION_CATEGORIES

        self.assertIn("domain_audit", RETENTION_CATEGORIES)
        self.assertIn("projections", RETENTION_CATEGORIES)


class TestAuditExport(unittest.TestCase):
    def test_csv_has_header(self) -> None:
        from app.domains.audit.audit_export_service import export_domain_audit_csv

        fake_row = {
            "id": "a1",
            "occurred_at": None,
            "tenant_id": "t1",
            "project_id": "p1",
            "actor_kind": "user",
            "actor_id": "u1",
            "actor_name": "alice",
            "action": "run.created",
            "target_type": "run",
            "target_id": "r1",
            "correlation_id": None,
            "metadata": {},
        }
        with patch(
            "app.domains.audit.audit_export_service.iter_domain_audit_export_rows",
            return_value=iter([fake_row]),
        ):
            body = export_domain_audit_csv(tenant="t1", project="p1", limit=1)
        self.assertIn(b"id,occurred_at", body)


class TestGovernanceConfig(unittest.TestCase):
    def test_default_retention_days(self) -> None:
        from app.domains.governance.governance_config import default_retention_days

        self.assertGreaterEqual(default_retention_days(), 1)
