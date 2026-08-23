"""Unit tests for kernel-backed independent observation and telemetry trust (P0 / P0.1)."""

from __future__ import annotations

import os
import time
import unittest

from sdk.independent_observation import (
    ADVISORY,
    IndependentObserver,
    TRUSTED,
    UNTRUSTED,
    prefer_observed_usage,
    snapshot_pid,
)


class TestPreferObservedUsage(unittest.TestCase):
    def test_reported_when_no_observed(self) -> None:
        reported = {"cpu_seconds": 1.0, "memory_rss_peak_kb": 2048}
        out = prefer_observed_usage(reported=reported, observed=None)
        self.assertEqual(out["attribution_source"], "reported")
        self.assertEqual(out["telemetry_trust"], ADVISORY)
        self.assertEqual(out["trust_reason"], "worker_only")
        self.assertEqual(out["usage"]["cpu_seconds"], 1.0)
        self.assertIsNone(out["observed_usage"])

    def test_observed_wins_and_mismatch_is_untrusted(self) -> None:
        reported = {"cpu_seconds": 1.0, "memory_rss_peak_kb": 1024, "gpu_seconds": 3.0}
        observed = {
            "observation_source": "cgroup",
            "cpu_time_seconds": 9.5,
            "memory_mb_peak": 40.0,
            "cpu_percent_peak": 80.0,
        }
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["attribution_source"], "observed")
        self.assertEqual(out["telemetry_trust"], UNTRUSTED)
        self.assertEqual(out["trust_reason"], "mismatch")
        self.assertEqual(out["usage"]["cpu_seconds"], 9.5)
        self.assertEqual(out["usage"]["memory_mb_peak"], 40.0)
        self.assertEqual(out["usage"]["memory_rss_peak_kb"], 40960)
        self.assertEqual(out["usage"]["gpu_seconds"], 3.0)
        self.assertEqual(out["reported_usage"]["cpu_seconds"], 1.0)

    def test_agreeing_observation_is_trusted(self) -> None:
        reported = {"cpu_seconds": 2.0, "memory_mb_peak": 10.0}
        observed = {
            "observation_source": "procfs",
            "cpu_time_seconds": 2.1,
            "memory_mb_peak": 10.4,
        }
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["attribution_source"], "observed")
        self.assertEqual(out["telemetry_trust"], TRUSTED)
        self.assertEqual(out["trust_reason"], "observed")
        self.assertEqual(out["usage"]["cpu_seconds"], 2.1)

    def test_observed_only_is_trusted(self) -> None:
        observed = {
            "observation_source": "cgroup",
            "cpu_time_seconds": 4.0,
            "memory_mb_peak": 8.0,
        }
        out = prefer_observed_usage(reported=None, observed=observed)
        self.assertEqual(out["telemetry_trust"], TRUSTED)
        self.assertEqual(out["trust_reason"], "observed")

    def test_missing_telemetry_is_untrusted(self) -> None:
        out = prefer_observed_usage(reported=None, observed=None)
        self.assertEqual(out["telemetry_trust"], UNTRUSTED)
        self.assertEqual(out["trust_reason"], "missing")

    def test_worker_underreport_memory_is_untrusted(self) -> None:
        reported = {"cpu_seconds": 0.03, "memory_mb_peak": 2.76}
        observed = {
            "observation_source": "procfs",
            "cpu_time_seconds": 0.0,
            "memory_mb_peak": 5.39,
        }
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["attribution_source"], "observed")
        self.assertEqual(out["telemetry_trust"], UNTRUSTED)
        self.assertEqual(out["trust_reason"], "mismatch")
        self.assertEqual(out["usage"]["memory_mb_peak"], 5.39)

    def test_tiny_cpu_delta_does_not_untrust(self) -> None:
        reported = {"cpu_seconds": 0.0, "memory_mb_peak": 5.0}
        observed = {
            "observation_source": "procfs",
            "cpu_time_seconds": 0.03,
            "memory_mb_peak": 5.2,
        }
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["telemetry_trust"], TRUSTED)

    def test_none_source_stays_reported(self) -> None:
        reported = {"cpu_seconds": 2.0}
        observed = {"observation_source": "none", "cpu_time_seconds": None}
        out = prefer_observed_usage(reported=reported, observed=observed)
        self.assertEqual(out["attribution_source"], "reported")
        self.assertEqual(out["telemetry_trust"], ADVISORY)


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
