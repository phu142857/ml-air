"""Unit tests for executor-side resource monitor helpers."""

from __future__ import annotations

import unittest

from sdk.resource_monitor import merge_resource_usage, resource_monitor_enabled
from sdk.usage_cost_math import normalize_cpu_tree_percent


class TestResourceMonitorHelpers(unittest.TestCase):
    def test_merge_resource_usage_prefers_later(self) -> None:
        merged = merge_resource_usage(
            {"duration_ms": 1000, "cpu_time_seconds": 1.0, "memory_rss_kb": 512},
            {"memory_rss_kb": 2048, "gpu_seconds": 30.0},
        )
        self.assertEqual(merged["duration_ms"], 1000)
        self.assertEqual(merged["cpu_time_seconds"], 1.0)
        self.assertEqual(merged["memory_rss_kb"], 2048)
        self.assertEqual(merged["gpu_seconds"], 30.0)

    def test_resource_monitor_enabled_default(self) -> None:
        self.assertTrue(resource_monitor_enabled())

    def test_normalize_cpu_tree_percent(self) -> None:
        self.assertEqual(normalize_cpu_tree_percent(792.0, logical_cpus=8), 99.0)
        self.assertEqual(normalize_cpu_tree_percent(50.0, logical_cpus=8), 50.0)
        self.assertEqual(normalize_cpu_tree_percent(None), None)


if __name__ == "__main__":
    unittest.main()
