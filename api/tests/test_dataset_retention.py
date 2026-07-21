"""Unit tests for dataset version retention planning."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.domains.governance import dataset_retention_service as svc


class TestDatasetRetentionPlan(unittest.TestCase):
    def test_disabled_policy_yields_no_candidates(self) -> None:
        with patch.object(svc, "get_dataset_retention_policy", return_value={"enabled": False, "max_versions": 5}):
            with patch.object(svc.lineage_service, "list_dataset_versions", return_value=[{"version_id": "a"}]):
                out = svc.plan_dataset_retention_purge("t", "p", "ds")
        self.assertEqual(out["eligible_count"], 0)
        self.assertEqual(out["candidates"], [])

    def test_beyond_max_versions_marks_oldest(self) -> None:
        now = datetime.now(timezone.utc)
        versions = [
            {"version_id": "v-new", "created_at": now.isoformat()},
            {"version_id": "v-mid", "created_at": (now - timedelta(days=1)).isoformat()},
            {"version_id": "v-old", "created_at": (now - timedelta(days=2)).isoformat()},
        ]
        policy = {
            "enabled": True,
            "max_versions": 1,
            "max_age_days": None,
            "protect_referenced": False,
        }
        with patch.object(svc, "get_dataset_retention_policy", return_value=policy):
            with patch.object(svc, "_referenced_version_ids", return_value=set()):
                with patch.object(svc.lineage_service, "list_dataset_versions", return_value=versions):
                    out = svc.plan_dataset_retention_purge("t", "p", "ds")
        ids = {c["version_id"] for c in out["candidates"]}
        self.assertIn("v-mid", ids)
        self.assertIn("v-old", ids)
        self.assertNotIn("v-new", ids)

    def test_keeps_at_least_one_version(self) -> None:
        now = datetime.now(timezone.utc)
        versions = [{"version_id": "only", "created_at": now.isoformat()}]
        policy = {"enabled": True, "max_versions": 1, "max_age_days": None, "protect_referenced": False}
        with patch.object(svc, "get_dataset_retention_policy", return_value=policy):
            with patch.object(svc, "_referenced_version_ids", return_value=set()):
                with patch.object(svc.lineage_service, "list_dataset_versions", return_value=versions):
                    out = svc.plan_dataset_retention_purge("t", "p", "ds")
        self.assertEqual(out["candidates"], [])

    def test_protect_referenced_skips_version(self) -> None:
        now = datetime.now(timezone.utc)
        versions = [
            {"version_id": "v-new", "created_at": now.isoformat()},
            {"version_id": "v-old", "created_at": (now - timedelta(days=30)).isoformat()},
        ]
        policy = {"enabled": True, "max_versions": 1, "max_age_days": None, "protect_referenced": True}
        with patch.object(svc, "get_dataset_retention_policy", return_value=policy):
            with patch.object(svc, "_referenced_version_ids", return_value={"v-old"}):
                with patch.object(svc.lineage_service, "list_dataset_versions", return_value=versions):
                    out = svc.plan_dataset_retention_purge("t", "p", "ds")
        self.assertEqual(out["candidates"], [])

    def test_upsert_rejects_invalid_max_versions(self) -> None:
        with self.assertRaises(ValueError):
            svc.upsert_dataset_retention_policy(
                "t", "p", "ds", enabled=True, max_versions=0, max_age_days=None
            )


if __name__ == "__main__":
    unittest.main()
