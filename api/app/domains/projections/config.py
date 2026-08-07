"""Phase 3 projection feature flags."""

from __future__ import annotations

import os


def projections_enabled() -> bool:
    return os.getenv("ML_AIR_PROJECTIONS_ENABLED", "0").strip() == "1"


def timeline_projection_reads_enabled() -> bool:
    return os.getenv("ML_AIR_TIMELINE_PROJECTION_READS", "0").strip() == "1"


def dashboard_projection_reads_enabled() -> bool:
    return os.getenv("ML_AIR_DASHBOARD_PROJECTION_READS", "0").strip() == "1"


def notification_delivery_enabled() -> bool:
    return os.getenv("ML_AIR_NOTIFICATION_DELIVERY", "0").strip() == "1"


def integration_delivery_enabled() -> bool:
    return os.getenv("ML_AIR_INTEGRATION_DELIVERY", "0").strip() == "1"
