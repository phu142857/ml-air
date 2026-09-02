"""Tests for workload container monitoring helpers."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sdk.podman_client import parse_stats_sample
from sdk.workload_container_monitor import WorkloadContainerMonitor, workload_container_monitor_enabled


class ParseStatsSampleTests(unittest.TestCase):
    def test_cpu_percent_from_usage_delta(self) -> None:
        stats = {
            "name": "vet-ai-local",
            "cpu_stats": {
                "cpu_usage": {"total_usage": 2_000_000_000},
                "online_cpus": 16,
            },
            "memory_stats": {"usage": 358_686_720},
        }
        sample, total = parse_stats_sample(
            stats,
            prev_total_usage_ns=1_000_000_000,
            prev_at=100.0,
            sampled_at=101.0,
        )
        self.assertEqual(total, 2_000_000_000)
        self.assertAlmostEqual(sample["cpu_percent"], 100.0)
        self.assertAlmostEqual(sample["memory_mb"], 342.0, delta=1.0)

    def test_first_sample_uses_libpod_cpu_field(self) -> None:
        stats = {
            "cpu_stats": {"cpu": 160.0, "online_cpus": 16, "cpu_usage": {"total_usage": 5}},
            "memory_stats": {"usage": 100 * 1024 * 1024},
        }
        sample, _ = parse_stats_sample(stats, prev_total_usage_ns=None, prev_at=None, sampled_at=1.0)
        self.assertGreater(sample["cpu_percent"], 0.0)


class WorkloadContainerMonitorTests(unittest.TestCase):
    @patch.dict("os.environ", {"ML_AIR_WORKLOAD_CONTAINER_NAME": "vet-ai-local"}, clear=False)
    def test_enabled_when_container_name_set(self) -> None:
        self.assertTrue(workload_container_monitor_enabled())

    @patch.dict("os.environ", {"ML_AIR_WORKLOAD_CONTAINER_NAME": ""}, clear=False)
    def test_disabled_without_container_name(self) -> None:
        self.assertFalse(workload_container_monitor_enabled())

    @patch("sdk.workload_container_monitor.fetch_container_stats")
    def test_monitor_accumulates_cpu_time(self, fetch_mock) -> None:
        fetch_mock.side_effect = [
            {
                "name": "vet-ai-local",
                "cpu_stats": {"cpu_usage": {"total_usage": 1_000_000_000}, "online_cpus": 8},
                "memory_stats": {"usage": 200 * 1024 * 1024},
            },
            {
                "name": "vet-ai-local",
                "cpu_stats": {"cpu_usage": {"total_usage": 3_000_000_000}, "online_cpus": 8},
                "memory_stats": {"usage": 220 * 1024 * 1024},
            },
        ]
        monitor = WorkloadContainerMonitor(
            container_name="vet-ai-local",
            interval_seconds=0.01,
            flush_interval_seconds=0,
        )
        monitor._sample_once(1.0)
        monitor._sample_once(2.0)
        report = monitor.build_report()
        self.assertAlmostEqual(report["resource_usage"]["cpu_time_seconds"], 2.0)


if __name__ == "__main__":
    unittest.main()
