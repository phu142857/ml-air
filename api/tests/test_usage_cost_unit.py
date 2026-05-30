"""Unit tests for resource usage aggregation (no database, no monetary cost)."""

from __future__ import annotations

import unittest

from sdk.usage_cost_math import aggregate_samples, normalize_resource_usage


class TestUsageMath(unittest.TestCase):
    def test_normalize_resource_usage_disk(self) -> None:
        ru = normalize_resource_usage(
            {"cpu_time_seconds": 1.5, "disk_read_bytes": 1024, "disk_write_bytes": 2048}
        )
        self.assertEqual(ru["cpu_time_seconds"], 1.5)
        self.assertEqual(ru["disk_read_bytes"], 1024)
        self.assertEqual(ru["disk_write_bytes"], 2048)

    def test_aggregate_samples_fallback(self) -> None:
        agg = aggregate_samples([], runtime_seconds=120.0, fallback_memory_mb=4.0)
        self.assertEqual(agg["sample_count"], 0)
        self.assertAlmostEqual(agg["memory_mb_seconds"], 480.0, places=1)
        self.assertEqual(agg["memory_rss_peak_kb"], 4096)
        self.assertIsNone(agg["cpu_pct_avg"])
        self.assertEqual(agg["memory_mb_peak"], 4.0)

    def test_aggregate_samples_avg_peak(self) -> None:
        from datetime import datetime, timezone

        t0 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        t1 = datetime(2026, 1, 1, 0, 0, 30, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 1, 0, 1, 0, tzinfo=timezone.utc)
        samples = [
            (t0, 40.0, 512.0, 10.0, 256.0),
            (t1, 60.0, 768.0, 30.0, 512.0),
            (t2, 80.0, 1024.0, 50.0, 768.0),
        ]
        agg = aggregate_samples(samples, runtime_seconds=60.0, fallback_memory_mb=None)
        self.assertEqual(agg["sample_count"], 3)
        self.assertAlmostEqual(agg["cpu_pct_avg"], 60.0)
        self.assertAlmostEqual(agg["cpu_pct_peak"], 80.0)
        self.assertAlmostEqual(agg["memory_mb_avg"], (512 + 768 + 1024) / 3)
        self.assertAlmostEqual(agg["memory_mb_peak"], 1024.0)
        self.assertAlmostEqual(agg["gpu_util_pct_avg"], 30.0)
        self.assertAlmostEqual(agg["gpu_util_pct_peak"], 50.0)
        self.assertAlmostEqual(agg["gpu_memory_mb_avg"], (256 + 512 + 768) / 3)
        self.assertAlmostEqual(agg["gpu_memory_mb_peak"], 768.0)


if __name__ == "__main__":
    unittest.main()
