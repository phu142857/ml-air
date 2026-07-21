"""Strict dataset_version_id on POST /runs when declared readiness inputs exist."""

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


class TestStrictPostRunsDatasetVersion(unittest.TestCase):
    @patch.dict(os.environ, {"ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "1"}, clear=False)
    @patch("app.api.routes.v1.create_run")
    @patch(
        "app.api.routes.v1.readiness_service.effective_declared_readiness_inputs",
        return_value=[{"dataset": "d1"}],
    )
    @patch(
        "app.api.routes.v1._merge_pinned_dataset_version_for_run",
        return_value=({"inputs": [{"dataset": "d1", "required_size": 1}]}, {}),
    )
    @patch("app.api.routes.v1._validate_pipeline_plugin_contract")
    @patch("app.api.routes.v1.pipeline_version_service.get_pipeline_version")
    @patch("app.api.routes.v1.pipeline_version_service.get_latest_version_id", return_value="pv-1")
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_post_runs_rejects_without_pinned_version_when_inputs_declared(
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
            idempotency_key="strict-post-runs-1",
        )
        with self.assertRaises(HTTPException) as ctx:
            v1.trigger_run_v1("default", "default_project", payload, authorization="Bearer maintainer-token")
        self.assertEqual(ctx.exception.status_code, 422)
        detail = ctx.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("reason"), "DATASET_VERSION_REQUIRED")
        mock_create_run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
