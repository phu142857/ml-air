"""Unit tests for sdk.run_context and worker_client URL helpers."""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from sdk.run_context import RunContext, resolve_tracking_scope, start_run
from sdk.worker_client import _task_url, worker_api_base


class TestResolveTrackingScope(unittest.TestCase):
    def test_explicit_overrides_env(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_RUN_ID": "from-env"}, clear=False):
            scope = resolve_tracking_scope(run_id="explicit")
            self.assertEqual(scope["ML_AIR_RUN_ID"], "explicit")

    def test_defaults_tenant_project(self) -> None:
        scope = resolve_tracking_scope(run_id="r1")
        self.assertEqual(scope["ML_AIR_TENANT_ID"], "default")
        self.assertEqual(scope["ML_AIR_PROJECT_ID"], "default_project")


class TestStartRun(unittest.TestCase):
    def test_sets_and_restores_run_id_env(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with start_run(run_id="run-abc", monitor=False) as ctx:
                self.assertEqual(ctx.run_id, "run-abc")
                self.assertEqual(os.environ.get("ML_AIR_RUN_ID"), "run-abc")
            self.assertIsNone(os.environ.get("ML_AIR_RUN_ID"))

    def test_complete_bundle_empty_without_monitor(self) -> None:
        with start_run(run_id="r1", monitor=False) as ctx:
            bundle = ctx.complete_bundle()
        self.assertEqual(bundle["usage_samples"], [])
        self.assertEqual(bundle["resource_usage"], {})

    @patch("sdk.run_context.ResourceMonitor")
    @patch("sdk.run_context.resource_monitor_enabled", return_value=True)
    def test_monitor_complete_bundle(self, _enabled: MagicMock, monitor_cls: MagicMock) -> None:
        instance = monitor_cls.return_value
        instance.complete_bundle.return_value = {
            "resource_usage": {"duration_seconds": 1},
            "usage_samples": [{"cpu_percent": 10}],
        }
        instance.__enter__ = MagicMock(return_value=instance)
        instance.__exit__ = MagicMock(return_value=False)

        with start_run(task_id="t1", run_id="r1") as ctx:
            self.assertEqual(os.environ.get("ML_AIR_TASK_ID"), "t1")
            bundle = ctx.complete_bundle()

        self.assertEqual(bundle["resource_usage"]["duration_seconds"], 1)
        monitor_cls.assert_called_once()
        call_kw = monitor_cls.call_args.kwargs
        self.assertEqual(call_kw["task_id"], "t1")


class TestWorkerClient(unittest.TestCase):
    def test_task_url_with_colon_task_id(self) -> None:
        url = _task_url("task:1", "complete", base_url="http://api:8080")
        self.assertEqual(url, "http://api:8080/v1/tasks/task:1/complete")

    def test_worker_api_base_prefers_mlair_env(self) -> None:
        with patch.dict(
            os.environ,
            {"MLAIR_API_BASE_URL": "http://mlair-api:8080", "ML_AIR_BASE_URL": "http://other"},
            clear=False,
        ):
            self.assertEqual(worker_api_base(), "http://mlair-api:8080")


if __name__ == "__main__":
    unittest.main()
