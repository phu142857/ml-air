"""Scheduler task retry backoff (shared by scheduler and tests)."""

from __future__ import annotations


def compute_retry_delay_seconds(backoff_ms: int, current_attempt: int) -> float:
    """Exponential backoff from task row policy: ``backoff_ms * 2^(attempt-1)`` in seconds."""
    base_ms = max(0, int(backoff_ms))
    attempt = max(1, int(current_attempt))
    return (base_ms * (2 ** (attempt - 1))) / 1000.0


def should_schedule_retry(*, current_attempt: int, max_attempts: int) -> bool:
    return int(current_attempt) < int(max_attempts)


def next_retry_attempt(current_attempt: int) -> int:
    return int(current_attempt) + 1
