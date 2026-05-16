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

from app.domains.lifecycle import lineage_service, readiness_service


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

    @patch("app.domains.lifecycle.lineage_service._materialize_runtime_feedback_if_needed", return_value=("vid-1", "v12"))
    @patch("app.domains.lifecycle.lineage_service.get_dataset_buffer", return_value={"accumulation_strategy": "manual_materialize_only", "source_type": "runtime_feedback", "current_size": 2000})
    @patch("app.domains.lifecycle.lineage_service.get_dataset", return_value={"dataset_id": "ds1", "source_uri": None, "checksum": None})
    def test_manual_materialize_endpoint_path(self, _ds, _buf, _materialize) -> None:
        out = lineage_service.materialize_dataset_buffer_now(tenant_id="t", project_id="p", dataset_id="ds1")
        self.assertIsNotNone(out)
        self.assertEqual(out["version"], "v12")
        self.assertEqual(out["dataset_version_id"], "vid-1")

    @patch("app.domains.lifecycle.readiness_service._allow_legacy_readiness_fallback", return_value=True)
    @patch("app.domains.lifecycle.readiness_service.get_or_create_dataset_training_policy", return_value={"policy_id": "p1", "required_size": 1000, "validation_rules": []})
    @patch("app.domains.lifecycle.readiness_service._load_latest_dataset_version_row", return_value={"version_id": "v-1", "record_count": 1200})
    @patch("app.domains.lifecycle.readiness_service._load_dataset_row", return_value={"dataset_id": "ds1", "name": "dataset-a", "current_size": 0})
    def test_readiness_evaluate_uses_version_record_count(self, _ds, _latest, _policy, _legacy) -> None:
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

    @patch("app.domains.lifecycle.readiness_service._allow_legacy_readiness_fallback", return_value=False)
    @patch("app.domains.lifecycle.readiness_service.get_or_create_dataset_training_policy", return_value={"policy_id": "p1", "required_size": 1000, "validation_rules": []})
    @patch("app.domains.lifecycle.readiness_service._load_latest_dataset_version_row", return_value={"version_id": "v-1", "record_count": 100, "status": "ready"})
    @patch("app.domains.lifecycle.readiness_service._load_dataset_row", return_value={"dataset_id": "ds1", "name": "dataset-a", "current_size": 0})
    def test_readiness_rejects_implicit_latest_head_when_legacy_off(self, _ds, _latest, _policy, _legacy) -> None:
        with self.assertRaises(ValueError) as ctx:
            readiness_service.evaluate_dataset_readiness(
                tenant_id="t",
                project_id="p",
                dataset_id="ds1",
            )
        self.assertEqual(str(ctx.exception), "dataset_version_id_required")

    @patch("app.domains.lifecycle.readiness_service._load_dataset_row", return_value={"dataset_id": "ds1", "name": "dataset-a", "current_size": 999})
    @patch("app.domains.lifecycle.readiness_service._load_latest_dataset_version_row", return_value=None)
    @patch("app.domains.lifecycle.readiness_service.get_or_create_dataset_training_policy", return_value={"policy_id": "p1", "required_size": 1000, "validation_rules": []})
    @patch("app.domains.lifecycle.readiness_service._allow_legacy_readiness_fallback", return_value=False)
    def test_readiness_strict_mode_requires_materialized_version(self, _fb, _policy, _latest, _ds) -> None:
        with self.assertRaises(ValueError):
            readiness_service.evaluate_dataset_readiness(
                tenant_id="t",
                project_id="p",
                dataset_id="ds1",
            )

    @patch("app.domains.lifecycle.lineage_service._materialize_runtime_feedback_if_needed", return_value=("vid-2", "v13"))
    @patch("app.domains.lifecycle.lineage_service.get_dataset", return_value={"dataset_id": "ds2", "source_uri": None, "checksum": None})
    @patch(
        "app.domains.lifecycle.lineage_service.db_conn",
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

    @patch(
        "app.domains.lifecycle.readiness_service.list_dataset_training_policies",
        return_value=[
            {"policy_id": "p-a", "model_id": "m1", "trigger_mode": "manual", "required_size": 100},
            {"policy_id": "p-b", "model_id": None, "trigger_mode": "auto_ready", "required_size": 500},
        ],
    )
    @patch("app.domains.lifecycle.readiness_service.evaluate_dataset_readiness")
    def test_summarize_eligibility_per_policy(self, mock_eval, _pols) -> None:
        def _ev(**kwargs: object) -> dict:
            pid = kwargs.get("policy_id")
            if pid == "p-a":
                return {
                    "ready": True,
                    "status": "eligible",
                    "required_size": 100,
                    "current_size": 200,
                    "dataset_version_id": "ver-1",
                    "reasons": [],
                    "eligibility_criteria": [],
                    "policy_id": "p-a",
                }
            return {
                "ready": False,
                "status": "blocked",
                "required_size": 500,
                "current_size": 100,
                "dataset_version_id": "ver-1",
                "reasons": [{"code": "size_threshold", "message": "too small"}],
                "eligibility_criteria": [{"code": "size_threshold", "label": "Dataset size threshold", "status": "fail"}],
                "policy_id": "p-b",
            }

        mock_eval.side_effect = _ev
        out = readiness_service.summarize_dataset_training_eligibility(
            tenant_id="t", project_id="p", dataset_id="ds1", dataset_version_id="ver-1", policy_id=None
        )
        self.assertEqual(len(out["items"]), 2)
        self.assertEqual(len(out["eligible"]), 1)
        self.assertEqual(len(out["blocked"]), 1)
        self.assertEqual(out["eligible"][0]["policy_id"], "p-a")
        self.assertEqual(out["blocked"][0]["policy_id"], "p-b")

    @patch("app.domains.lifecycle.readiness_service._upsert_run_dataset_lineage")
    @patch("app.domains.lifecycle.readiness_service._dataset_actual_size", return_value=("ds-pin", 0))
    @patch(
        "app.domains.lifecycle.lineage_service.get_dataset_version",
        return_value={"dataset_id": "ds-pin", "record_count": 200},
    )
    @patch("app.domains.lifecycle.readiness_service.load_run_for_readiness")
    def test_check_run_readiness_uses_pinned_version_record_count(
        self, mock_load_run, _mock_gdv, _mock_das, _mock_upsert
    ) -> None:
        mock_load_run.return_value = {
            "tenant_id": "t",
            "project_id": "p",
            "training_mode": "quick",
            "override_config": {
                "dataset_version_id": "ver-pin-1",
                "inputs": [{"dataset": "myds", "required_size": 50}],
            },
            "config_snapshot": {},
            "plugin_context": {},
        }
        out = readiness_service.check_run_readiness("t", "p", "run-1")
        self.assertTrue(out["ready"])
        self.assertEqual(out["details"][0]["actual_size"], 200)
        self.assertEqual(out["details"][0].get("dataset_version_id"), "ver-pin-1")

    def test_effective_declared_readiness_inputs_override_over_snapshot(self) -> None:
        snap = {"inputs": [{"dataset": "from-snap", "required_size": 1}]}
        ovr = {"inputs": [{"dataset": "from-ovr", "required_size": 2}]}
        rows = readiness_service.effective_declared_readiness_inputs(ovr, snap)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["dataset"], "from-ovr")

    def test_effective_declared_readiness_inputs_empty_override_uses_snapshot(self) -> None:
        snap = {"inputs": [{"dataset": "only-snap", "required_size": 5}]}
        rows = readiness_service.effective_declared_readiness_inputs({"inputs": []}, snap)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["dataset"], "only-snap")

    def test_merge_distinct_tags_dedupes(self) -> None:
        self.assertEqual(
            lineage_service._merge_distinct_tags(["a", "b"], ["b", "c"]),  # type: ignore[attr-defined]
            ["a", "b", "c"],
        )

    def test_merge_distinct_external_refs_dedupes_by_url(self) -> None:
        self.assertEqual(
            lineage_service._merge_distinct_external_refs(  # type: ignore[attr-defined]
                [{"url": "https://a.example/x", "label": "A"}],
                [{"url": "https://a.example/x", "label": "dup"}, {"url": "https://b.example/"}],
            ),
            [{"url": "https://a.example/x", "label": "A"}, {"url": "https://b.example/"}],
        )


if __name__ == "__main__":
    unittest.main()
