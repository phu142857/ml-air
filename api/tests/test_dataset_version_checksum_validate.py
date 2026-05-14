from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

# Allow running tests without psycopg installed (same pattern as test_dataset_lifecycle_refactor).
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

from app.services.lineage_service import (
    DatasetVersionSnapshotIntegrityError,
    _validate_dataset_version_snapshot_if_enabled,
)


class TestDatasetVersionChecksumValidate(unittest.TestCase):
    def test_skipped_when_env_off(self) -> None:
        p = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        try:
            p.write(b"x")
            p.flush()
            uri = f"file://{p.name}"
            with patch.dict(os.environ, {"ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM": "0"}, clear=False):
                _validate_dataset_version_snapshot_if_enabled(uri, "deadbeef")
        finally:
            p.close()
            os.unlink(p.name)

    def test_skips_when_checksum_empty(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM": "1"}, clear=False):
            _validate_dataset_version_snapshot_if_enabled("file:///tmp/nope", "")

    def test_skips_non_file_uri(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM": "1"}, clear=False):
            _validate_dataset_version_snapshot_if_enabled("s3://bucket/obj", "abc")

    def test_mismatch_raises(self) -> None:
        p = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        try:
            p.write(b"hello-checksum-body")
            p.flush()
            uri = f"file://{p.name}"
            good = hashlib.sha256(b"hello-checksum-body").hexdigest()
            self.assertNotEqual(good, "0" * 64)
            with patch.dict(os.environ, {"ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM": "1"}, clear=False):
                with self.assertRaises(DatasetVersionSnapshotIntegrityError) as ctx:
                    _validate_dataset_version_snapshot_if_enabled(uri, "0" * 64)
                self.assertEqual(ctx.exception.code, "checksum_mismatch")
        finally:
            p.close()
            os.unlink(p.name)

    def test_match_ok(self) -> None:
        p = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        try:
            p.write(b"ok-body")
            p.flush()
            uri = f"file://{p.name}"
            good = hashlib.sha256(b"ok-body").hexdigest()
            with patch.dict(os.environ, {"ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM": "1"}, clear=False):
                _validate_dataset_version_snapshot_if_enabled(uri, good.upper())
        finally:
            p.close()
            os.unlink(p.name)

    def test_missing_file_raises(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM": "1"}, clear=False):
            with self.assertRaises(DatasetVersionSnapshotIntegrityError) as ctx:
                _validate_dataset_version_snapshot_if_enabled("file:///nonexistent/path/mlair-missing.csv", "a" * 64)
            self.assertEqual(ctx.exception.code, "artifact_missing")


if __name__ == "__main__":
    unittest.main()
