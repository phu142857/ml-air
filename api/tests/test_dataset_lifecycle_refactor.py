from __future__ import annotations

import sys
import types
import unittest
from unittest.mock import patch

# Allow running tests without psycopg/redis installed in lightweight environments.
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

from app.services import lineage_service, readiness_service


class TestDatasetLifecycleRefactor(unittest.TestCase):
    def test_materialization_idempotency_key_is_stable(self) -> None:
        a = lineage_service._materialization_idempotency_key(  # type: ignore[attr-defined]
            dataset_id="ds1",
            strategy="snapshot_on_threshold",
            target_threshold=1000,
            current_size=1200,
            source_type="runtime_feedback",
            uri="s3://bucket/ds.csv",
            checksum="abc",
        )
        b = lineage_service._materialization_idempotency_key(  # type: ignore[attr-defined]
            dataset_id="ds1",
            strategy="snapshot_on_threshold",
            target_threshold=1000,
            current_size=1200,
            source_type="runtime_feedback",
            uri="s3://bucket/ds.csv",
            checksum="abc",
        )
        c = lineage_service._materialization_idempotency_key(  # type: ignore[attr-defined]
            dataset_id="ds1",
            strategy="snapshot_on_threshold",
            target_threshold=1000,
            current_size=1300,
            source_type="runtime_feedback",
            uri="s3://bucket/ds.csv",
            checksum="abc",
        )
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)

    @patch("app.services.lineage_service._materialize_runtime_feedback_if_needed", return_value=("vid-1", "v12"))
    @patch("app.services.lineage_service.get_dataset_buffer", return_value={"accumulation_strategy": "manual_materialize_only", "source_type": "runtime_feedback", "current_size": 2000})
    @patch("app.services.lineage_service.get_dataset", return_value={"dataset_id": "ds1", "source_uri": None, "checksum": None})
    def test_manual_materialize_endpoint_path(self, _ds, _buf, _materialize) -> None:
        out = lineage_service.materialize_dataset_buffer_now(tenant_id="t", project_id="p", dataset_id="ds1")
        self.assertIsNotNone(out)
        self.assertEqual(out["version"], "v12")
        self.assertEqual(out["dataset_version_id"], "vid-1")

    @patch("app.services.readiness_service.get_or_create_dataset_training_policy", return_value={"policy_id": "p1", "required_size": 1000, "validation_rules": []})
    @patch("app.services.readiness_service._load_latest_dataset_version_row", return_value={"version_id": "v-1", "record_count": 1200})
    @patch("app.services.readiness_service._load_dataset_row", return_value={"dataset_id": "ds1", "name": "dataset-a", "current_size": 0})
    def test_readiness_evaluate_uses_version_record_count(self, _ds, _latest, _policy) -> None:
        out = readiness_service.evaluate_dataset_readiness(
            tenant_id="t",
            project_id="p",
            dataset_id="ds1",
            required_size=1000,
        )
        self.assertEqual(out["dataset_version_id"], "v-1")
        self.assertEqual(out["current_size"], 1200)
        self.assertTrue(out["ready"])
        self.assertEqual(out["status"], "eligible")

    @patch("app.services.lineage_service._materialize_runtime_feedback_if_needed", return_value=("vid-2", "v13"))
    @patch("app.services.lineage_service.get_dataset", return_value={"dataset_id": "ds2", "source_uri": None, "checksum": None})
    @patch(
        "app.services.lineage_service.db_conn",
        autospec=True,
    )
    def test_materialize_scheduled_buffers_threshold_guard(self, mock_db_conn, _ds, _mat) -> None:
        class _Cur:
            def execute(self, *_args, **_kwargs):
                return None

            def fetchall(self):
                return [("ds2", "runtime_feedback", 1500, 1000), ("ds3", "runtime_feedback", 100, 1000)]

        class _Ctx:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def cursor(self):
                return _Ctx()

            def execute(self, *_args, **_kwargs):
                return None

            def fetchall(self):
                return _Cur().fetchall()

        mock_db_conn.return_value = _Ctx()
        out = lineage_service.materialize_scheduled_buffers(tenant_id="t", project_id="p", limit=10)
        self.assertEqual(out["checked"], 2)
        self.assertEqual(out["materialized_count"], 1)
        self.assertEqual(out["materialized"][0]["dataset_id"], "ds2")


if __name__ == "__main__":
    unittest.main()
