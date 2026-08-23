"""Unit tests for kernel-backed independent observation (P0)."""

from __future__ import annotations

import os
import time
import unittest

from sdk.independent_observation import (
    IndependentObserver,
    prefer_observed_usage,
    snapshot_pid,
)


class TestPreferObservedUsage(unittest.TestCase):
    def test_reported_when_no_observed(self) -> None:
        reported = {"cpu_seconds": 1.0, "memory_rss_peak_kb": 2048}
        out = prefer_observed_usage(reported=reported, observed=None)
        self.assertEqual(out["attribution_source"], "reported")
        self.assertEqual(out["usage"]["cpu_seconds"], 1.0)
        self.assertIsNone(out["observed_usage"])

    def test_observed_wins_for_cpu_and_memory(self) -> None:
        reported = {"cpu_seconds": 1.0, "memory_rss_peak_kb": 1024, "gpu_seconds": 3.0}
        observed = {
            "observation_source": "cgroup",
            "cpu_time_seconds": 9.5,
            "memory_mb_peak": 40.0,
            "cpu_percent_peak": 80.0,
        }
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["attribution_source"], "observed")
        self.assertEqual(out["usage"]["cpu_seconds"], 9.5)
        self.assertEqual(out["usage"]["memory_mb_peak"], 40.0)
        self.assertEqual(out["usage"]["memory_rss_peak_kb"], 40960)
        self.assertEqual(out["usage"]["gpu_seconds"], 3.0)
        self.assertEqual(out["reported_usage"]["cpu_seconds"], 1.0)

    def test_none_source_stays_reported(self) -> None:
        reported = {"cpu_seconds": 2.0}
        observed = {"observation_source": "none", "cpu_time_seconds": None}
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["attribution_source"], "reported")


class TestSnapshotSelf(unittest.TestCase):
    def test_snapshot_current_process(self) -> None:
        snap = snapshot_pid(os.getpid())
        self.assertEqual(snap["pid"], os.getpid())
        self.assertIn(snap["observation_source"], {"cgroup", "procfs", "none"})
        if snap["observation_source"] != "none":
            self.assertTrue(
                snap.get("memory_mb") is not None or snap.get("cpu_time_seconds") is not None
            )

    def test_observer_collects_samples(self) -> None:
        obs = IndependentObserver(interval_seconds=0.25)
        obs.start(os.getpid(), worker_id="p0-test")
        time.sleep(0.6)
        report = obs.stop()
        identity = report["resource_identity"]
        usage = report["observed_usage"]
        self.assertEqual(identity["pid"], os.getpid())
        self.assertEqual(identity["worker_id"], "p0-test")
        self.assertGreaterEqual(usage["sample_count"], 1)
        self.assertIn(usage["observation_source"], {"cgroup", "procfs", "none"})


if __name__ == "__main__":
    unittest.main()
