from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.governance import trigger_policy_service


class TriggerPolicyDataAnchorTests(unittest.TestCase):
    @patch("app.domains.governance.trigger_policy_service.lineage_service.get_dataset")
    @patch("app.domains.governance.trigger_policy_service.lineage_service.get_dataset_version")
    @patch("app.domains.governance.trigger_policy_service.readiness_service.get_dataset_training_policy_by_id")
    def test_normalize_data_anchor_accepts_version_and_policy(
        self,
        mock_get_policy,
        mock_get_version,
        mock_get_dataset,
    ) -> None:
        mock_get_version.return_value = {"dataset_id": "ds-1", "version_id": "ver-1"}
        mock_get_dataset.return_value = {"dataset_id": "ds-1"}
        mock_get_policy.return_value = {"policy_id": "pol-1"}

        did, vid, pid = trigger_policy_service._normalize_data_anchor(
            tenant_id="t",
            project_id="p",
            dataset_id=None,
            dataset_version_id="ver-1",
            training_policy_id="pol-1",
        )
        self.assertEqual(did, "ds-1")
        self.assertEqual(vid, "ver-1")
        self.assertEqual(pid, "pol-1")

    @patch("app.domains.governance.trigger_policy_service.lineage_service.get_dataset_version")
    def test_normalize_data_anchor_rejects_missing_version(self, mock_get_version) -> None:
        mock_get_version.return_value = None
        with self.assertRaises(ValueError) as ctx:
            trigger_policy_service._normalize_data_anchor(
                tenant_id="t",
                project_id="p",
                dataset_id=None,
                dataset_version_id="missing",
                training_policy_id=None,
            )
        self.assertEqual(str(ctx.exception), "dataset_version_not_found")

    def test_normalize_data_anchor_clears_when_all_empty(self) -> None:
        self.assertEqual(
            trigger_policy_service._normalize_data_anchor(
                tenant_id="t",
                project_id="p",
                dataset_id=None,
                dataset_version_id=None,
                training_policy_id=None,
            ),
            (None, None, None),
        )


if __name__ == "__main__":
    unittest.main()
