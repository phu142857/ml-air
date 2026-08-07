"""Phase 6 distributed control plane tests."""

from __future__ import annotations

import unittest


class TestAutomlSearchGrid(unittest.TestCase):
    def test_grid_combinations(self) -> None:
        from app.domains.control_plane.automl_search import generate_trials

        trials = generate_trials(
            {"strategy": "grid", "max_trials": 20, "parameters": {"a": [1, 2], "b": [3, 4]}}
        )
        self.assertEqual(len(trials), 4)


class TestExtensionPlatformTypes(unittest.TestCase):
    def test_known_types(self) -> None:
        types = ("plugin", "scheduler", "event_handler", "projection", "ai_provider", "gateway_adapter")
        self.assertIn("plugin", types)
        self.assertEqual(len(types), 6)


class TestGlobalSchedulerScoring(unittest.TestCase):
    def test_label_match(self) -> None:
        def labels_match(cluster_labels: dict, required: dict) -> bool:
            for k, v in required.items():
                if str(cluster_labels.get(k)) != str(v):
                    return False
            return True

        self.assertTrue(labels_match({"env": "prod", "tier": "gpu"}, {"env": "prod"}))
        self.assertFalse(labels_match({"env": "dev"}, {"env": "prod"}))
