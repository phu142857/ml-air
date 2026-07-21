from __future__ import annotations

import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

if "psycopg" not in sys.modules:
    _psycopg_stub = types.ModuleType("psycopg")
    _psycopg_stub.Connection = object  # type: ignore[attr-defined]
    _psycopg_stub.connect = lambda *args, **kwargs: None  # type: ignore[attr-defined]
    sys.modules["psycopg"] = _psycopg_stub
    _psycopg_types = types.ModuleType("psycopg.types")
    _psycopg_json = types.ModuleType("psycopg.types.json")
    _psycopg_json.Json = dict  # type: ignore[attr-defined]
    sys.modules["psycopg.types"] = _psycopg_types
    sys.modules["psycopg.types.json"] = _psycopg_json
if "redis" not in sys.modules:
    _redis_stub = types.ModuleType("redis")
    _redis_stub.Redis = object  # type: ignore[attr-defined]
    sys.modules["redis"] = _redis_stub

from app.domains.lifecycle.lineage_service import _lineage_snapshot_version_label


class TestLineageSnapshotVersionLabel(unittest.TestCase):
    def test_explicit_version_passthrough(self) -> None:
        c: dict[str, str] = {}
        self.assertEqual(
            _lineage_snapshot_version_label("ds-1", "  v42  ", batch_unpinned_cache=c),
            "v42",
        )
        self.assertEqual(c, {})

    @patch.dict(os.environ, {"ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL": "1"}, clear=False)
    def test_legacy_default_when_env_set(self) -> None:
        c: dict[str, str] = {}
        self.assertEqual(_lineage_snapshot_version_label("ds-1", None, batch_unpinned_cache=c), "default")
        self.assertEqual(_lineage_snapshot_version_label("ds-1", "", batch_unpinned_cache=c), "default")

    @patch.dict(os.environ, {"ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL": ""}, clear=False)
    @patch("app.domains.lifecycle.lineage_service._allocate_next_monotonic_dataset_version_label", return_value="v3")
    def test_allocates_and_caches_per_batch(self, mock_alloc: MagicMock) -> None:
        c: dict[str, str] = {}
        self.assertEqual(_lineage_snapshot_version_label("ds-1", None, batch_unpinned_cache=c), "v3")
        self.assertEqual(_lineage_snapshot_version_label("ds-1", None, batch_unpinned_cache=c), "v3")
        mock_alloc.assert_called_once_with("ds-1")

    @patch.dict(os.environ, {"ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL": ""}, clear=False)
    @patch("app.domains.lifecycle.lineage_service._allocate_next_monotonic_dataset_version_label", side_effect=["v2", "v4"])
    def test_separate_datasets_in_same_batch(self, mock_alloc: MagicMock) -> None:
        c: dict[str, str] = {}
        self.assertEqual(_lineage_snapshot_version_label("ds-a", None, batch_unpinned_cache=c), "v2")
        self.assertEqual(_lineage_snapshot_version_label("ds-b", None, batch_unpinned_cache=c), "v4")
        self.assertEqual(mock_alloc.call_count, 2)


if __name__ == "__main__":
    unittest.main()
