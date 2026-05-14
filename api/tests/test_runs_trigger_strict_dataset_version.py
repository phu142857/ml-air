"""Contract: strict Hub train path rejects missing dataset_version_id."""

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


class TestRunsTriggerStrictDatasetVersion(unittest.TestCase):
    @patch.dict(os.environ, {"ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "1"}, clear=False)
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_trigger_rejects_missing_dataset_version_id(self, mock_auth, _authz) -> None:
        mock_auth.return_value = SimpleNamespace(role="maintainer", tenant_id=None, project_ids=None)
        payload = v1.TriggerRunByModelIn(
            model_id="model-1",
            dataset_id="dataset-1",
            dataset_version_id=None,
            idempotency_key="test-trigger-strict-1",
        )
        with self.assertRaises(HTTPException) as ctx:
            v1.trigger_run_by_model_dataset_v1(
                "default",
                "default_project",
                payload,
                authorization="Bearer maintainer-token",
            )
        self.assertEqual(ctx.exception.status_code, 422)
        detail = ctx.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("reason"), "DATASET_VERSION_REQUIRED")

    @patch.dict(os.environ, {"ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "1"}, clear=False)
    @patch("app.api.routes.v1.authorize_scope")
    @patch("app.api.routes.v1.authenticate_bearer")
    def test_trigger_rejects_blank_dataset_version_id(self, mock_auth, _authz) -> None:
        mock_auth.return_value = SimpleNamespace(role="maintainer", tenant_id=None, project_ids=None)
        payload = v1.TriggerRunByModelIn(
            model_id="model-1",
            dataset_id="dataset-1",
            dataset_version_id="   ",
            idempotency_key="test-trigger-strict-2",
        )
        with self.assertRaises(HTTPException) as ctx:
            v1.trigger_run_by_model_dataset_v1(
                "default",
                "default_project",
                payload,
                authorization="Bearer maintainer-token",
            )
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
