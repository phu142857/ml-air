"""Resolve MLAir API bearer tokens (Identity Service Accounts)."""

from __future__ import annotations

import os


def resolve_platform_api_token() -> str:
    """Token for scheduler / executor → API (Service Account secret)."""
    return (
        os.getenv("ML_AIR_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.getenv("MLAIR_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.getenv("ML_AIR_SA_SCHEDULER_SECRET", "").strip()
        or os.getenv("ML_AIR_SA_EXECUTOR_SECRET", "").strip()
        or os.getenv("ML_AIR_TRACKING_TOKEN", "").strip()
    )


def resolve_worker_api_token() -> str:
    """Token for external workers (lease / complete / logs)."""
    return (
        os.getenv("ML_AIR_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.getenv("MLAIR_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.getenv("ML_AIR_SA_WORKER_SECRET", "").strip()
        or os.getenv("MLAIR_WORKER_TOKEN", "").strip()
        or os.getenv("ML_AIR_WORKER_TOKEN", "").strip()
        or os.getenv("ML_AIR_TOKEN", "").strip()
        or os.getenv("ML_AIR_TRACKING_TOKEN", "").strip()
    )
