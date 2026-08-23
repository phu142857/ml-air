"""Unit tests for the P2 evaluation harness (no live cluster)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS = _ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from mlair_eval.stats import (  # noqa: E402
    PRODUCTION_SUBMIT_CELLS,
    PUBLISH_SUBMIT_CELLS,
    percentiles,
    parse_prom_counter,
    parse_vmrss_mb,
    relative_error,
    submit_cells_for_profile,
    summarize_latencies,
)


class TestPercentiles(unittest.TestCase):
    def test_empty(self) -> None:
        self.assertEqual(percentiles([]), {"p50": None, "p95": None, "p99": None})

    def test_single(self) -> None:
        self.assertEqual(percentiles([4.0])["p50"], 4.0)
        self.assertEqual(percentiles([4.0])["p99"], 4.0)

    def test_odd_median(self) -> None:
        self.assertEqual(percentiles([1, 2, 3, 4, 5])["p50"], 3.0)

    def test_interpolate(self) -> None:
        p95 = percentiles([0, 10, 20, 30, 40])["p95"]
        self.assertIsNotNone(p95)
        self.assertGreater(p95, 30)
        self.assertLessEqual(p95, 40)


class TestRelativeError(unittest.TestCase):
    def test_none_sides(self) -> None:
        self.assertIsNone(relative_error(None, 1.0))
        self.assertIsNone(relative_error(1.0, None))

    def test_exact(self) -> None:
        self.assertEqual(relative_error(5.0, 5.0), 0.0)

    def test_ratio(self) -> None:
        self.assertAlmostEqual(relative_error(12.0, 10.0), 0.2)


class TestParsers(unittest.TestCase):
    def test_vmrss(self) -> None:
        text = "Name:\tpython\nVmRSS:\t  2048 kB\nVmSize:\t 10000 kB\n"
        self.assertAlmostEqual(parse_vmrss_mb(text), 2.0)

    def test_vmrss_missing(self) -> None:
        self.assertIsNone(parse_vmrss_mb("Name:\tpython\n"))

    def test_prom_labeled_sum(self) -> None:
        text = (
            "# HELP mlair_scheduler_task_completed_total tasks\n"
            'mlair_scheduler_task_completed_total{status="SUCCESS"} 3.0\n'
            'mlair_scheduler_task_completed_total{status="FAILED"} 1.0\n'
        )
        self.assertEqual(parse_prom_counter(text, "mlair_scheduler_task_completed_total"), 4.0)

    def test_prom_missing(self) -> None:
        self.assertIsNone(parse_prom_counter("unrelated 1\n", "mlair_scheduler_run_scheduled_total"))


class TestMatrix(unittest.TestCase):
    def test_smoke_not_full_cartesian(self) -> None:
        cells = submit_cells_for_profile("smoke")
        self.assertEqual(cells, ((1, 8, 2),))

    def test_publish_covers_axes(self) -> None:
        cells = submit_cells_for_profile("publish")
        self.assertEqual(cells, PUBLISH_SUBMIT_CELLS)
        tenants = {c[0] for c in cells}
        tasks = {c[1] for c in cells}
        conc = {c[2] for c in cells}
        self.assertEqual(tenants, {1, 10, 50})
        self.assertEqual(tasks, {100, 1000})
        self.assertEqual(conc, {1, 10, 100})
        self.assertLess(len(cells), 3 * 2 * 3)

    def test_production_stays_single_tenant(self) -> None:
        cells = submit_cells_for_profile("production")
        self.assertEqual(cells, PRODUCTION_SUBMIT_CELLS)
        self.assertEqual(cells[0][0], 1)

    def test_summarize_n(self) -> None:
        out = summarize_latencies([1.0, 2.0, 3.0])
        self.assertEqual(out["n"], 3)
        self.assertEqual(out["p50"], 2.0)


if __name__ == "__main__":
    unittest.main()
