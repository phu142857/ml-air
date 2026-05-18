"""Tests for ``semantic_observability_model`` (Phase 9 MVP)."""

from __future__ import annotations

import unittest

from app.domains.lifecycle.realtime_events import EventType
from app.domains.observability.semantic_observability_model import (
    SEMANTIC_OBSERVABILITY_SURFACES,
    all_semantic_observability_metric_names,
)


class TestSemanticObservabilityModel(unittest.TestCase):
    def test_each_metric_has_valid_kind(self) -> None:
        kinds = {"counter", "histogram", "gauge"}
        for surf in SEMANTIC_OBSERVABILITY_SURFACES:
            for m in surf.get("metrics") or ():
                self.assertIn(m["kind"], kinds, m)
                self.assertIsInstance(m["labels"], tuple, m)

    def test_metric_names_unique_and_prefixed(self) -> None:
        names = sorted(all_semantic_observability_metric_names())
        self.assertEqual(len(names), len(set(names)), "duplicate metric name in model")
        for n in names:
            self.assertTrue(n.startswith("mlair_"), n)
            self.assertRegex(n, r"^mlair_(lifecycle|dataset|eligibility|readiness)_", n)

    def test_event_types_are_known_enum_values(self) -> None:
        allowed = {e.value for e in EventType}
        for surf in SEMANTIC_OBSERVABILITY_SURFACES:
            for et in surf.get("event_types") or ():
                self.assertIn(et, allowed, f"surface={surf.get('id')} unknown event type {et!r}")

    def test_surfaces_are_json_serializable(self) -> None:
        import json

        from app.domains.observability.semantic_observability_model import semantic_observability_surfaces_dict

        raw = json.dumps(semantic_observability_surfaces_dict())
        self.assertIn("mlair_lifecycle_training_triggered_total", raw)
