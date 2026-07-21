"""Unit tests for cgroup CPU quota helpers."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sdk.cgroup import cpu_quota_cores, effective_cpu_count
from sdk.usage_cost_math import normalize_cpu_tree_percent, percentile


class TestCgroupCpu(unittest.TestCase):
    def test_effective_cpu_count_without_quota(self) -> None:
        with patch("sdk.cgroup.cpu_quota_cores", return_value=None):
            self.assertEqual(effective_cpu_count(logical_cpus=32), 32)

    def test_effective_cpu_count_with_quota(self) -> None:
        with patch("sdk.cgroup.cpu_quota_cores", return_value=4.0):
            self.assertEqual(effective_cpu_count(logical_cpus=32), 4)

    def test_normalize_cpu_uses_cgroup_quota(self) -> None:
        with patch("sdk.cgroup.cpu_quota_cores", return_value=4.0):
            # 400% on sum-of-cores scale over 4s wall with 4 cores saturated => ~100%
            self.assertAlmostEqual(normalize_cpu_tree_percent(400.0, logical_cpus=32) or 0.0, 100.0, places=1)

    def test_percentile_p95(self) -> None:
        vals = [float(i) for i in range(1, 101)]
        self.assertAlmostEqual(percentile(vals, 95) or 0.0, 95.05, places=1)


if __name__ == "__main__":
    unittest.main()
