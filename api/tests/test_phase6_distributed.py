"""Phase 6 distributed control plane tests (Phase IV productionize)."""

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

    def test_score_placement_gpu_bonus(self) -> None:
        from app.domains.distributed.global_scheduler_service import _score_placement

        region = {"code": "apac", "preference_weight": 2.0, "latency_ms_hint": 40}
        cluster = {"name": "c1", "capacity": {"gpu_available": 4}}
        score, rationale = _score_placement(region, cluster, gpu_required=True, latency_budget_ms=50)
        self.assertGreater(score, 2.0)
        self.assertEqual(rationale["region_code"], "apac")
        self.assertTrue(rationale["gpu_required"])


class TestPlacementSummary(unittest.TestCase):
    def test_placement_summary_from_place_result(self) -> None:
        from app.domains.distributed.global_scheduler_service import placement_summary

        out = placement_summary(
            {
                "placement_id": "p1",
                "cluster": {"cluster_id": "c1", "name": "demo"},
                "region": {"region_id": "r1", "code": "apac"},
                "node_pool": "default",
                "node_id": "node-1",
                "score": 3.5,
            }
        )
        self.assertEqual(out["cluster_id"], "c1")
        self.assertEqual(out["region_code"], "apac")
        self.assertEqual(out["node_id"], "node-1")


class TestSchedulerClusterFilter(unittest.TestCase):
    def test_run_matches_local_cluster(self) -> None:
        def matches(run_event: dict, local_cluster_id: str) -> bool:
            if not local_cluster_id:
                return True
            placement = run_event.get("placement") if isinstance(run_event.get("placement"), dict) else {}
            target = str(placement.get("cluster_id") or "").strip()
            return not target or target == local_cluster_id

        self.assertTrue(matches({"placement": {"cluster_id": "c1"}}, "c1"))
        self.assertFalse(matches({"placement": {"cluster_id": "c2"}}, "c1"))
        self.assertTrue(matches({"placement": {}}, "c1"))
        self.assertTrue(matches({}, ""))


class TestSchedulingHints(unittest.TestCase):
    def test_extract_scheduling_from_override(self) -> None:
        from app.domains.orchestration.run_service import _scheduling_hints

        hints = _scheduling_hints({"scheduling": {"gpu_required": True, "region_preference": "apac"}})
        self.assertTrue(hints.get("gpu_required"))
        self.assertEqual(hints.get("region_preference"), "apac")
        self.assertEqual(_scheduling_hints(None), {})
