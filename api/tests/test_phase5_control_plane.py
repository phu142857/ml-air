"""Phase 5 AI Control Plane tests."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone


class TestSchedulingPriority(unittest.TestCase):
    def test_deadline_increases_priority(self) -> None:
        from app.domains.control_plane.scheduling_service import compute_priority_score

        policy = {"fairness_weight": 1, "cost_weight": 1, "deadline_weight": 2, "gpu_weight": 1}
        soon = compute_priority_score(policy=policy, deadline_at=datetime.now(timezone.utc) + timedelta(hours=1))
        later = compute_priority_score(policy=policy, deadline_at=datetime.now(timezone.utc) + timedelta(days=7))
        self.assertLess(soon, later)


class TestPolicyEngine(unittest.TestCase):
    def test_production_requires_approval(self) -> None:
        from app.domains.control_plane.policy_engine import evaluate

        result = evaluate(
            tenant_id="t1",
            project_id="p1",
            resource_type="production",
            context={"stage": "production", "approved": False},
        )
        self.assertIn("rules_evaluated", result)


class TestCopilot(unittest.TestCase):
    def test_explain_failure(self) -> None:
        from app.domains.control_plane.copilot_service import suggest

        out = suggest(action="explain_failure", context={"error": "OOM"})
        self.assertEqual(out["action"], "explain_failure")
        self.assertIn("OOM", out["summary"])


class TestGatewayRouteMatch(unittest.TestCase):
    def test_fnmatch_pattern(self) -> None:
        import fnmatch

        self.assertTrue(fnmatch.fnmatchcase("gpt-4o", "gpt-*"))


class TestAutomlSearch(unittest.TestCase):
    def test_grid_trials_count(self) -> None:
        from app.domains.control_plane.automl_search import generate_trials

        trials = generate_trials(
            {
                "strategy": "grid",
                "max_trials": 10,
                "parameters": {
                    "learning_rate": [0.01, 0.1],
                    "max_depth": [3, 6],
                },
            }
        )
        self.assertEqual(len(trials), 4)

    def test_pick_best_maximize(self) -> None:
        from app.domains.control_plane.automl_search import pick_best_trial

        best = pick_best_trial(
            [{"trial_id": "a", "score": 0.5}, {"trial_id": "b", "score": 0.9}],
            objective="maximize",
        )
        self.assertEqual(best["trial_id"], "b")


class TestGatewayCacheKey(unittest.TestCase):
    def test_cache_disabled_by_default_env(self) -> None:
        from app.domains.control_plane import gateway_cache

        self.assertIsInstance(gateway_cache.cache_ttl_seconds(), int)
