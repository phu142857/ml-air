"""Lifecycle invariants (Phase 9 partial machine checks — not full formal proofs)."""

from __future__ import annotations

import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

try:
    import psycopg  # type: ignore # noqa: F401
except Exception:
    _psycopg_stub = types.ModuleType("psycopg")
    _psycopg_stub.Connection = object  # type: ignore[attr-defined]
    _psycopg_stub.connect = lambda *args, **kwargs: None  # type: ignore[attr-defined]
    sys.modules["psycopg"] = _psycopg_stub
try:
    import redis  # type: ignore # noqa: F401
except Exception:
    _redis_stub = types.ModuleType("redis")
    _redis_stub.Redis = object  # type: ignore[attr-defined]
    sys.modules["redis"] = _redis_stub

from app.api.routes import v1
from app.domains.lifecycle.evaluation_semantics import readiness_eval_result_matches_stored_row


class TestImmutableTrainingAnchorInvariants(unittest.TestCase):
    def test_all_post_runs_defaults_on(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "1"}, clear=False):
            os.environ.pop("ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS", None)
            self.assertTrue(v1._strict_dataset_version_all_post_runs())

    @patch.dict(
        os.environ,
        {
            "ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "1",
            "ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS": "0",
        },
        clear=False,
    )
    @patch("app.api.routes.v1.create_run", return_value={"run_id": "r1"})
    @patch(
        "app.api.routes.v1.readiness_service.effective_declared_readiness_inputs",
        return_value=[],
    )
    @patch(
        "app.api.routes.v1._merge_pinned_dataset_version_for_run",
        return_value=({}, {}),
    )
    @patch("app.api.routes.v1._validate_pipeline_plugin_contract")
    @patch("app.api.routes.v1.pipeline_version_service.get_pipeline_version")
    @patch("app.api.routes.v1.pipeline_version_service.get_latest_version_id", return_value="pv-1")
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_unpinned_generic_post_runs_allowed_when_all_post_runs_off(
        self,
        mock_auth,
        _authz,
        _gl,
        mock_pv,
        _vpc,
        _merge,
        _eff,
        mock_create_run,
    ) -> None:
        mock_auth.return_value = SimpleNamespace(role="maintainer", tenant_id=None, project_ids=None)
        mock_pv.return_value = {
            "tenant_id": "default",
            "project_id": "default_project",
            "pipeline_id": "p1",
            "config": {"tasks": [{"plugin": "stub", "id": "t1"}]},
        }
        payload = v1.TriggerRunIn(
            pipeline_id="p1",
            use_latest_pipeline_version=True,
            idempotency_key="legacy-unpinned-1",
        )
        out = v1.trigger_run_v1("default", "default_project", payload, authorization="Bearer maintainer-token")
        self.assertEqual(out.get("run_id"), "r1")
        mock_create_run.assert_called_once()


class TestReadinessDedupeInvariant(unittest.TestCase):
    """Property: semantic-equal readiness rows match regardless of reason order."""

    def test_invariant_reason_order_irrelevant(self) -> None:
        base = {
            "required_size": 10,
            "current_size": 5,
            "status": "blocked",
            "policy_id": "p1",
            "dataset_version_id": "dv1",
        }
        a = {**base, "reasons": [{"code": "x", "message": "1"}, {"code": "y", "message": "2"}]}
        b = {**base, "reasons": [{"code": "y", "message": "2"}, {"code": "x", "message": "1"}]}
        self.assertTrue(readiness_eval_result_matches_stored_row(a, b))

    def test_invariant_size_change_breaks_match(self) -> None:
        stored = {
            "required_size": 10,
            "current_size": 5,
            "status": "blocked",
            "policy_id": "p1",
            "dataset_version_id": "dv1",
            "reasons": [],
        }
        result = {**stored, "current_size": 6}
        self.assertFalse(readiness_eval_result_matches_stored_row(stored, result))


if __name__ == "__main__":
    unittest.main()
