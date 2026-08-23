"""Lifecycle invariants (Phase 9 partial machine checks — not full formal proofs)."""

from __future__ import annotations

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
from app.domains.governance.admission_decision import build_resource_state


def _features(**overrides: object) -> SimpleNamespace:
    base = {
        "strict_dataset_version_required": True,
        "strict_dataset_version_all_post_runs": True,
        "require_declared_dataset_inputs": False,
        "readiness_allow_legacy_fallback": False,
    }
    base.update(overrides)
    return SimpleNamespace(features=SimpleNamespace(**base))


class TestImmutableTrainingAnchorInvariants(unittest.TestCase):
    @patch("app.api.routes.v1.get_settings", return_value=_features())
    def test_all_post_runs_defaults_on(self, _settings) -> None:
        self.assertTrue(v1._strict_dataset_version_all_post_runs())

    @patch(
        "app.domains.governance.admission_queue_service.snapshot_resource_state",
        return_value=build_resource_state(capacity={"cpu": 8, "memory_mb": 8192, "gpu": 0, "tasks": 32}),
    )
    @patch(
        "app.api.routes.v1.get_settings",
        return_value=_features(
            strict_dataset_version_required=True,
            strict_dataset_version_all_post_runs=False,
        ),
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
        _settings,
        _snap,
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


class TestStrictDatasetVersionPinInvariant(unittest.TestCase):
    """Invariant: with strict pin on (default), unpinned runs are blocked; pinned runs pass."""

    @patch("app.api.routes.v1.get_settings", return_value=_features())
    def test_all_post_runs_unpinned_blocked(self, _settings) -> None:
        with self.assertRaises(HTTPException) as ctx:
            v1._ensure_strict_dataset_version_for_all_post_runs_when_enabled({})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail.get("reason"), "DATASET_VERSION_REQUIRED")

    @patch("app.api.routes.v1.get_settings", return_value=_features())
    def test_all_post_runs_pinned_allowed(self, _settings) -> None:
        v1._ensure_strict_dataset_version_for_all_post_runs_when_enabled(
            {"dataset_version_id": "dv-1"}
        )

    @patch(
        "app.api.routes.v1.get_settings",
        return_value=_features(strict_dataset_version_required=False),
    )
    def test_strict_off_unpinned_allowed(self, _settings) -> None:
        v1._ensure_strict_dataset_version_for_all_post_runs_when_enabled({})

    @patch("app.api.routes.v1.get_settings", return_value=_features())
    @patch(
        "app.api.routes.v1.readiness_service.effective_declared_readiness_inputs",
        return_value=[{"dataset": "example-dataset", "required_size": 50}],
    )
    def test_declared_inputs_unpinned_blocked(self, _eff, _settings) -> None:
        with self.assertRaises(HTTPException) as ctx:
            v1._ensure_strict_dataset_version_for_declared_inputs({}, {})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail.get("reason"), "DATASET_VERSION_REQUIRED")


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
