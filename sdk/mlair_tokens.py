"""Resolve MLAir API bearer tokens (Identity Service Accounts)."""

from __future__ import annotations

import os

from sdk.mlair_token_manager import resolve_platform_api_token as _resolve_platform_api_token_managed


def resolve_platform_api_token() -> str:
    """JWT for executor/scheduler → Hub API calls (dataset, model, tracking)."""
    managed = _resolve_platform_api_token_managed()
    if managed:
        return managed
    return (
        os.getenv("ML_AIR_ACCESS_TOKEN", "").strip()
        or os.getenv("ML_AIR_TRACKING_TOKEN", "").strip()
        or os.getenv("ML_AIR_TOKEN", "").strip()
    )


def resolve_worker_api_token() -> str:
    """Token for external workers (lease / complete / logs)."""
    return (
        os.getenv("ML_AIR_SA_WORKER_SECRET", "").strip()
        or os.getenv("ML_AIR_SA_EXECUTOR_SECRET", "").strip()
        or os.getenv("ML_AIR_SA_SCHEDULER_SECRET", "").strip()
        or os.getenv("ML_AIR_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.getenv("MLAIR_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.getenv("MLAIR_WORKER_TOKEN", "").strip()
        or os.getenv("ML_AIR_WORKER_TOKEN", "").strip()
    )
