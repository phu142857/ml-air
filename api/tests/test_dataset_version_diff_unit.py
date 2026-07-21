"""Unit tests for dataset version diff and provenance helpers."""

from __future__ import annotations

import sys
import unittest
from unittest.mock import MagicMock, patch

if "psycopg" not in sys.modules:
    psycopg_mock = MagicMock()
    psycopg_mock.types = MagicMock()
    psycopg_mock.types.json = MagicMock()
    sys.modules["psycopg"] = psycopg_mock
    sys.modules["psycopg.types"] = psycopg_mock.types
    sys.modules["psycopg.types.json"] = psycopg_mock.types.json

from app.domains.lifecycle import lineage_service


class DiffDatasetVersionsTests(unittest.TestCase):
    @patch("app.domains.lifecycle.lineage_service.get_dataset_version")
    def test_diff_computes_delta(self, mock_get: MagicMock) -> None:
        mock_get.side_effect = [
            {
                "version_id": "v1",
                "version": "1",
                "dataset_id": "ds-1",
                "checksum": "aaa",
                "record_count": 10,
                "source_type": "manual_upload",
                "canonical_source_type": "manual",
                "status": "ready",
                "quality_score": 90,
                "tags": ["a"],
                "external_refs": [],
                "created_at": "2026-01-01T00:00:00+00:00",
            },
            {
                "version_id": "v2",
                "version": "2",
                "dataset_id": "ds-1",
                "checksum": "bbb",
                "record_count": 15,
                "source_type": "runtime_accumulation",
                "canonical_source_type": "runtime_accumulated",
                "status": "ready",
                "quality_score": 100,
                "tags": ["a", "b"],
                "external_refs": [{"url": "https://x", "label": "x"}],
                "created_at": "2026-01-02T00:00:00+00:00",
            },
        ]
        out = lineage_service.diff_dataset_versions("t", "p", "ds-1", "v1", "v2")
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out["delta"]["record_count_delta"], 5)
        self.assertTrue(out["delta"]["checksum_changed"])
        self.assertTrue(out["delta"]["source_type_changed"])
        self.assertEqual(out["delta"]["tags_added"], ["b"])
        self.assertEqual(out["delta"]["tags_removed"], [])
        self.assertEqual(out["delta"]["external_refs_count_delta"], 1)

    def test_diff_same_version_raises(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            lineage_service.diff_dataset_versions("t", "p", "ds-1", "v1", "v1")
        self.assertEqual(str(ctx.exception), "diff_same_version")


if __name__ == "__main__":
    unittest.main()
