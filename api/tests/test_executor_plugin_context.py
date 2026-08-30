"""Regression tests for internal executor plugin context propagation (P2.5-F1)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from executor.plugin_context import build_plugin_execution_context


class TestPluginExecutionContext(unittest.TestCase):
    def test_injects_canonical_run_and_task_id(self) -> None:
        task = {
            "run_id": "bd9beeb9-4f96-4fb2-940e-e09f78fbbc8a",
            "task_id": "bd9beeb9-4f96-4fb2-940e-e09f78fbbc8a:data_prep",
            "context": {
                "tenant_id": "clinic",
                "project_id": "clinicVN",
                "training_mode": "local",
                "dataset_version_id": "64325bd4-ec83-4a17-897c-d88d3762b903",
            },
        }
        ctx = build_plugin_execution_context(
            task,
            tenant_id="clinic",
            project_id="clinicVN",
            pipeline_id="vetai_train_pipeline",
            trace_id="trace-abc",
        )
        self.assertEqual(ctx["run_id"], "bd9beeb9-4f96-4fb2-940e-e09f78fbbc8a")
        self.assertEqual(ctx["task_id"], "bd9beeb9-4f96-4fb2-940e-e09f78fbbc8a:data_prep")
        self.assertEqual(ctx["pipeline_id"], "vetai_train_pipeline")
        self.assertEqual(ctx["trace_id"], "trace-abc")
        self.assertEqual(ctx["dataset_version_id"], "64325bd4-ec83-4a17-897c-d88d3762b903")

    def test_does_not_overwrite_existing_context_ids(self) -> None:
        task = {
            "run_id": "hub-run-id",
            "task_id": "hub-run-id:data_prep",
            "context": {
                "run_id": "plugin-context-run-id",
                "task_id": "plugin-context-task-id",
            },
        }
        ctx = build_plugin_execution_context(
            task,
            tenant_id="clinic",
            project_id="clinicVN",
            pipeline_id="vetai_train_pipeline",
            trace_id=None,
        )
        self.assertEqual(ctx["run_id"], "plugin-context-run-id")
        self.assertEqual(ctx["task_id"], "plugin-context-task-id")

    def test_preserves_plugin_context_fields(self) -> None:
        plugin_context = {
            "tenant_id": "clinic",
            "project_id": "clinicVN",
            "execution_mode": "internal",
            "experiment_label": "V-M-Internal",
            "dataset_version_id": "64325bd4-ec83-4a17-897c-d88d3762b903",
        }
        ctx = build_plugin_execution_context(
            {"run_id": "r1", "task_id": "r1:data_prep", "context": plugin_context},
            tenant_id="clinic",
            project_id="clinicVN",
            pipeline_id="vetai_train_pipeline",
            trace_id="t1",
        )
        for key, value in plugin_context.items():
            self.assertEqual(ctx[key], value)


if __name__ == "__main__":
    unittest.main()
