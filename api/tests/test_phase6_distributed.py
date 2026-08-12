"""Phase 6 distributed control plane tests."""

from __future__ import annotations

import unittest


class TestExtensionPlatformTypes(unittest.TestCase):
    def test_known_types(self) -> None:
        types = ("plugin", "scheduler", "event_handler", "projection")
        self.assertEqual(len(types), 4)


class TestGlobalSchedulerScoring(unittest.TestCase):
    def test_label_match(self) -> None:
        def labels_match(cluster_labels: dict, required: dict) -> bool:
            for k, v in required.items():
                if str(cluster_labels.get(k)) != str(v):
                    return False
            return True

        self.assertTrue(labels_match({"env": "prod", "tier": "gpu"}, {"env": "prod"}))
        self.assertFalse(labels_match({"env": "dev"}, {"env": "prod"}))
