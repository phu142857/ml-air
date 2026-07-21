"""Tests for service dependency graph from spans."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.observability.trace_dependency_service import build_service_dependency_graph


class TestTraceDependency(unittest.TestCase):
    def test_build_service_dependency_graph(self) -> None:
        rows = [
            {"span_id": "a", "parent_span_id": None, "service_name": "mlair-api"},
            {"span_id": "b", "parent_span_id": "a", "service_name": "mlair-scheduler"},
            {"span_id": "c", "parent_span_id": "b", "service_name": "mlair-executor"},
        ]

        def _fetch(**_kwargs):
            return rows

        with patch(
            "app.domains.observability.trace_dependency_service.fetch_span_rows_for_trace",
            side_effect=_fetch,
        ):
            graph = build_service_dependency_graph(trace_id="abc", tenant_id="t1", project_id="p1")

        self.assertEqual(len(graph["nodes"]), 3)
        self.assertEqual(len(graph["edges"]), 2)
        self.assertEqual(graph["edges"][0]["from"], "mlair-api")

    def test_graph_from_waterfall_plugins(self) -> None:
        with patch(
            "app.domains.observability.trace_dependency_service.fetch_span_rows_for_trace",
            return_value=[],
        ):
            graph = build_service_dependency_graph(
                trace_id="abc",
                unified_waterfall={
                    "steps": [
                        {"kind": "run", "offset_ms": 0, "source": "mlair", "label": "Run"},
                        {"kind": "task", "offset_ms": 100, "source": "mlair", "plugin": "cv_yolo_split", "label": "split"},
                        {"kind": "task", "offset_ms": 200, "source": "mlair", "plugin": "cv_yolo_train", "label": "train"},
                    ]
                },
            )
        labels = {n["label"] for n in graph["nodes"]}
        self.assertIn("cv_yolo_split", labels)
        self.assertIn("cv_yolo_train", labels)
        self.assertTrue(graph["edges"])
