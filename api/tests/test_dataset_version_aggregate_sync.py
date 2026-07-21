"""Sync datasets.current_size when head version content is patched."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.lifecycle import lineage_service as ls


class DatasetVersionAggregateSyncTests(unittest.TestCase):
    @patch("app.domains.lifecycle.lineage_service._upsert_dataset_buffer")
    @patch("app.domains.lifecycle.lineage_service._upsert_dataset")
    @patch("app.domains.lifecycle.lineage_service.get_dataset_buffer")
    @patch("app.domains.lifecycle.lineage_service.get_dataset")
    @patch("app.domains.lifecycle.lineage_service.get_latest_materialized_dataset_version")
    def test_syncs_dataset_when_edited_version_is_head(
        self,
        mock_latest,
        mock_get_ds,
        mock_get_buf,
        mock_upsert_ds,
        mock_upsert_buf,
    ):
        mock_latest.return_value = {"version_id": "v-head"}
        mock_get_ds.return_value = {"name": "ds1", "dataset_id": "d1"}
        mock_get_buf.return_value = None

        ls._sync_dataset_aggregate_after_version_write(
            "t",
            "p",
            "d1",
            "v-head",
            record_count=47,
            checksum="abc",
        )

        mock_upsert_ds.assert_called_once()
        self.assertEqual(mock_upsert_ds.call_args.kwargs["current_size"], 47)
        mock_upsert_buf.assert_not_called()

    @patch("app.domains.lifecycle.lineage_service._upsert_dataset_buffer")
    @patch("app.domains.lifecycle.lineage_service._upsert_dataset")
    @patch("app.domains.lifecycle.lineage_service.get_dataset_buffer")
    @patch("app.domains.lifecycle.lineage_service.get_dataset")
    @patch("app.domains.lifecycle.lineage_service.get_latest_materialized_dataset_version")
    def test_skips_dataset_when_edited_version_is_not_head(
        self,
        mock_latest,
        mock_get_ds,
        mock_get_buf,
        mock_upsert_ds,
        mock_upsert_buf,
    ):
        mock_latest.return_value = {"version_id": "v-newer"}
        mock_get_ds.return_value = {"name": "ds1"}

        ls._sync_dataset_aggregate_after_version_write(
            "t",
            "p",
            "d1",
            "v-old",
            record_count=47,
            checksum="abc",
        )

        mock_upsert_ds.assert_not_called()
        mock_upsert_buf.assert_not_called()

    @patch("app.domains.lifecycle.lineage_service._upsert_dataset_buffer")
    @patch("app.domains.lifecycle.lineage_service._upsert_dataset")
    @patch("app.domains.lifecycle.lineage_service.get_dataset_buffer")
    @patch("app.domains.lifecycle.lineage_service.get_dataset")
    @patch("app.domains.lifecycle.lineage_service.get_latest_materialized_dataset_version")
    def test_syncs_buffer_when_last_materialized_matches(
        self,
        mock_latest,
        mock_get_ds,
        mock_get_buf,
        mock_upsert_ds,
        mock_upsert_buf,
    ):
        mock_latest.return_value = {"version_id": "v-head"}
        mock_get_ds.return_value = {"name": "ds1"}
        mock_get_buf.return_value = {
            "last_materialized_version_id": "v-head",
            "source_type": "runtime_feedback",
            "target_threshold": 1000,
            "accumulation_strategy": "snapshot_on_threshold",
            "window_status": "active",
        }

        ls._sync_dataset_aggregate_after_version_write(
            "t",
            "p",
            "d1",
            "v-head",
            record_count=47,
            checksum="abc",
        )

        mock_upsert_buf.assert_called_once()
        self.assertEqual(mock_upsert_buf.call_args.kwargs["current_size"], 47)


if __name__ == "__main__":
    unittest.main()
