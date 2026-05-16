"""Tests for shared scheduler retry backoff."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sdk.retry_policy import (
    compute_retry_delay_seconds,
    next_retry_attempt,
    should_schedule_retry,
)


class TestRetryPolicy(unittest.TestCase):
    def test_exponential_backoff_seconds(self) -> None:
        self.assertEqual(compute_retry_delay_seconds(1000, 1), 1.0)
        self.assertEqual(compute_retry_delay_seconds(1000, 2), 2.0)
        self.assertEqual(compute_retry_delay_seconds(1000, 3), 4.0)
        self.assertEqual(compute_retry_delay_seconds(500, 2), 1.0)

    def test_should_schedule_retry(self) -> None:
        self.assertTrue(should_schedule_retry(current_attempt=1, max_attempts=3))
        self.assertFalse(should_schedule_retry(current_attempt=3, max_attempts=3))

    def test_next_retry_attempt(self) -> None:
        self.assertEqual(next_retry_attempt(1), 2)


if __name__ == "__main__":
    unittest.main()
