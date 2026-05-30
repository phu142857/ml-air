"""Unit tests for Resource Usage Contract v1 helpers."""

from __future__ import annotations

import unittest

from sdk.usage_contract import (
    contract_complete_resource_usage,
    contract_heartbeat_from_sample,
    contract_summary_from_report,
    extract_contract_peaks,
    normalize_contract_resource_usage,
)
from sdk.usage_cost_math import normalize_cpu_tree_percent


class TestUsageContract(unittest.TestCase):
    def test_normalize_contract_duration_seconds_alias(self) -> None:
        out = normalize_contract_resource_usage({"duration_seconds": 1.5, "cpu_time_seconds": 2.0})
        self.assertEqual(out["duration_ms"], 1500)
        self.assertEqual(out["cpu_time_seconds"], 2.0)

    def test_normalize_contract_memory_mb_peak_alias(self) -> None:
        out = normalize_contract_resource_usage({"memory_mb_peak": 4.0})
        self.assertEqual(out["memory_rss_kb"], 4096)

    def test_extract_contract_peaks_normalizes_legacy_cpu(self) -> None:
        peaks = extract_contract_peaks({"cpu_percent_peak": 792.0})
        self.assertEqual(peaks["cpu_pct_peak"], normalize_cpu_tree_percent(792.0))

    def test_contract_summary_from_report(self) -> None:
        report = {
            "resource_usage": {
                "duration_ms": 2000,
                "cpu_time_seconds": 1.5,
                "disk_read_bytes": 100,
                "disk_write_bytes": 50,
            },
            "usage_samples": [
                {
                    "sampled_at": "2026-05-30T10:00:00+00:00",
                    "cpu_percent": 80,
                    "memory_mb": 100,
                    "gpu_util_percent": 90,
                    "gpu_memory_mb": 200,
                },
                {
                    "sampled_at": "2026-05-30T10:00:01+00:00",
                    "cpu_percent": 40,
                    "memory_mb": 150,
                    "gpu_util_percent": 70,
                    "gpu_memory_mb": 250,
                },
            ],
        }
        summary = contract_summary_from_report(report)
        self.assertEqual(summary["duration_seconds"], 2.0)
        self.assertEqual(summary["cpu_time_seconds"], 1.5)
        self.assertEqual(summary["cpu_percent_peak"], 80.0)
        self.assertEqual(summary["memory_mb_peak"], 150.0)
        self.assertEqual(summary["gpu_percent_peak"], 90.0)
        self.assertEqual(summary["gpu_memory_mb_peak"], 250.0)
        self.assertEqual(summary["disk_read_bytes"], 100)
        self.assertEqual(summary["disk_write_bytes"], 50)

    def test_contract_complete_resource_usage_merges_v1(self) -> None:
        report = {
            "resource_usage": {"duration_ms": 1000},
            "usage_samples": [{"cpu_percent": 50, "memory_mb": 512}],
        }
        out = contract_complete_resource_usage(report)
        self.assertEqual(out["duration_seconds"], 1.0)
        self.assertEqual(out["duration_ms"], 1000)
        self.assertEqual(out["cpu_percent_peak"], 50.0)
        self.assertEqual(out["memory_mb_peak"], 512.0)

    def test_contract_heartbeat_from_sample(self) -> None:
        hb = contract_heartbeat_from_sample(
            {"cpu_percent": 792, "memory_mb": 100, "gpu_util_percent": 88, "gpu_memory_mb": 7000}
        )
        assert hb is not None
        self.assertEqual(hb["cpu_percent"], normalize_cpu_tree_percent(792.0))
        self.assertEqual(hb["memory_mb"], 100)


if __name__ == "__main__":
    unittest.main()
