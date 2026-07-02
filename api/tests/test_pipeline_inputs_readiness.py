"""Pipeline config inputs[].required_size gate (distinct from training policy readiness)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.lifecycle import readiness_service as rs


class PipelineInputsReadinessTests(unittest.TestCase):
    @patch("app.domains.lifecycle.readiness_service._dataset_actual_size", return_value=("ds-example", 30))
    def test_blocks_when_actual_below_pipeline_required_size(self, _mock_size) -> None:
        out = rs.evaluate_pipeline_inputs_readiness(
            tenant_id="t",
            project_id="p",
            pipeline_config={
                "inputs": [{"dataset": "example-dataset", "required_size": 50}],
                "tasks": [],
            },
            override_config={"dataset_version_id": "ver-1"},
            plugin_context={},
            training_mode="standard",
        )
        self.assertFalse(out["ready"])
        self.assertFalse(out["pipeline_input_ready"])
        self.assertEqual(len(out["blocking_datasets"]), 1)
        self.assertEqual(out["blocking_datasets"][0]["actual_size"], 30)
        self.assertEqual(out["blocking_datasets"][0]["required_size"], 50)

    @patch(
        "app.domains.lifecycle.lineage_service.get_dataset_version",
        return_value={"dataset_id": "ds-example", "record_count": 60},
    )
    @patch("app.domains.lifecycle.readiness_service._dataset_actual_size", return_value=("ds-example", 12))
    def test_uses_pinned_version_record_count_for_matching_input_dataset(
        self, _mock_das, _mock_gdv
    ) -> None:
        out = rs.evaluate_pipeline_inputs_readiness(
            tenant_id="t",
            project_id="p",
            pipeline_config={"inputs": [{"dataset": "example-dataset", "required_size": 50}]},
            override_config={"dataset_version_id": "ver-pin"},
            plugin_context={"dataset_version_id": "ver-pin"},
            training_mode="standard",
        )
        self.assertTrue(out["ready"])
        self.assertEqual(out["details"][0]["actual_size"], 60)
        self.assertEqual(out["details"][0]["dataset_version_id"], "ver-pin")

    @patch(
        "app.domains.lifecycle.readiness_service._dataset_actual_size",
        side_effect=lambda _t, _p, name: ("ds-example", 12) if name == "example-dataset" else ("ds-upload", 30),
    )
    @patch(
        "app.domains.lifecycle.lineage_service.get_dataset_version",
        return_value={"dataset_id": "ds-upload", "record_count": 60},
    )
    def test_pin_does_not_apply_to_different_pipeline_input_dataset(self, _mock_gdv, _mock_das) -> None:
        """Pin on upload must not satisfy example-dataset input row."""
        out = rs.evaluate_pipeline_inputs_readiness(
            tenant_id="t",
            project_id="p",
            pipeline_config={"inputs": [{"dataset": "example-dataset", "required_size": 50}]},
            override_config={"dataset_version_id": "ver-upload"},
            plugin_context={},
            training_mode="standard",
        )
        self.assertFalse(out["ready"])
        self.assertEqual(out["blocking_datasets"][0]["dataset"], "example-dataset")
        self.assertEqual(out["blocking_datasets"][0]["actual_size"], 12)


if __name__ == "__main__":
    unittest.main()
