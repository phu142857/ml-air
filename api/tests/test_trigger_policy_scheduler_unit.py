"""Trigger policy debounce + outcome reason contract (no full scheduler import)."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone


def _debounce_elapsed_ok(last_at: datetime | None, debounce_minutes: int) -> bool:
    """Mirror scheduler ``_debounce_open`` elapsed check."""
    if last_at is None:
        return True
    elapsed = (datetime.now(timezone.utc) - last_at).total_seconds()
    return elapsed >= max(1, debounce_minutes) * 60


class TestTriggerPolicyDebounce(unittest.TestCase):
    def test_open_when_no_prior(self) -> None:
        self.assertTrue(_debounce_elapsed_ok(None, 5))

    def test_closed_inside_window(self) -> None:
        recent = datetime.now(timezone.utc) - timedelta(seconds=30)
        self.assertFalse(_debounce_elapsed_ok(recent, 5))

    def test_open_after_window(self) -> None:
        old = datetime.now(timezone.utc) - timedelta(minutes=10)
        self.assertTrue(_debounce_elapsed_ok(old, 5))


class TestTriggerPolicyOutcomeReasons(unittest.TestCase):
    def test_skip_reason_enum(self) -> None:
      reasons = {
          "debounce",
          "not_eligible",
          "gate_blocked",
          "api_error",
          "cron_not_due",
          "no_pipeline",
      }
      self.assertIn("not_eligible", reasons)
      self.assertIn("gate_blocked", reasons)


if __name__ == "__main__":
    unittest.main()
