from __future__ import annotations

import inspect
import unittest
from datetime import datetime, timezone

from app.domains.observability import audit_timeline_service
from app.domains.observability.timeline_adapter import (
    merge_timeline_items,
    project_domain_audit_to_timeline_item,
)


class TestTimelineAuditProjectionDeletion(unittest.TestCase):
    def test_sql_never_joins_model_versions_for_audit(self) -> None:
        src = inspect.getsource(audit_timeline_service.list_audit_timeline_page)
        # Allow unrelated joins (e.g. serving slots → models) but not audit→model_versions.
        self.assertNotIn("JOIN model_versions", src)
        self.assertNotIn("join model_versions", src.lower())

    def test_project_created_from_metadata_only(self) -> None:
        item = project_domain_audit_to_timeline_item(
            {
                "occurred_at": datetime(2026, 2, 1, tzinfo=timezone.utc),
                "action": "model_version.created",
                "metadata": {
                    "model_id": "m1",
                    "model_version_id": "mv1",
                    "version": 3,
                    "stage": "staging",
                },
            }
        )
        assert item is not None
        self.assertEqual(item["kind"], "model.version.created")
        self.assertEqual(item["resource_id"], "m1")
        self.assertEqual(item["payload"]["version_id"], "mv1")
        self.assertEqual(item["payload"]["version"], 3)
        self.assertEqual(item["payload"]["stage"], "staging")
        self.assertNotIn("artifact_uri", item["payload"])

    def test_project_deleted_kind(self) -> None:
        item = project_domain_audit_to_timeline_item(
            {
                "occurred_at": datetime(2026, 2, 2, tzinfo=timezone.utc),
                "action": "model_version.deleted",
                "metadata": {
                    "model_id": "m1",
                    "model_version_id": "mv1",
                    "version": 3,
                },
            }
        )
        assert item is not None
        self.assertEqual(item["kind"], "model.version.deleted")
        self.assertEqual(item["payload"]["version_id"], "mv1")

    def test_projection_survives_hard_delete_without_live_rows(self) -> None:
        """Simulate post-delete: only audit rows remain; no model_versions table available."""
        audit_rows = [
            {
                "occurred_at": datetime(2026, 2, 1, tzinfo=timezone.utc),
                "action": "model_version.created",
                "metadata": {
                    "model_id": "m1",
                    "model_version_id": "mv1",
                    "version": 1,
                    "stage": "staging",
                },
            },
            {
                "occurred_at": datetime(2026, 2, 1, 1, tzinfo=timezone.utc),
                "action": "model_version.approved",
                "metadata": {
                    "model_id": "m1",
                    "model_version_id": "mv1",
                    "version": 1,
                    "reason": "ok",
                },
            },
            {
                "occurred_at": datetime(2026, 2, 1, 2, tzinfo=timezone.utc),
                "action": "model_version.promoted",
                "metadata": {
                    "model_id": "m1",
                    "model_version_id": "mv1",
                    "version": 1,
                    "from_stage": "staging",
                    "to_stage": "production",
                    "approval_status": "approved",
                },
            },
            {
                "occurred_at": datetime(2026, 2, 1, 3, tzinfo=timezone.utc),
                "action": "model_version.deleted",
                "metadata": {
                    "model_id": "m1",
                    "model_version_id": "mv1",
                    "version": 1,
                },
            },
        ]
        projected = [project_domain_audit_to_timeline_item(r) for r in audit_rows]
        self.assertTrue(all(p is not None for p in projected))
        merged = merge_timeline_items([p for p in projected if p is not None])
        kinds = [it["kind"] for it in merged]
        self.assertEqual(
            kinds,
            [
                "model.version.deleted",
                "model.version.stage_updated",
                "model.version.approval_updated",
                "model.version.created",
            ],
        )
        # All still keyed to the same model resource after hard delete.
        self.assertTrue(all(it["resource_id"] == "m1" for it in merged))


if __name__ == "__main__":
    unittest.main()
