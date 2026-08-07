"""Phase 4 governance feature flags."""

from __future__ import annotations

import os


def event_retention_enabled() -> bool:
    return os.getenv("ML_AIR_EVENT_RETENTION_ENABLED", "0").strip() == "1"


def siem_export_enabled() -> bool:
    return os.getenv("ML_AIR_SIEM_EXPORT_ENABLED", "0").strip() == "1"


def event_schema_registry_enabled() -> bool:
    return os.getenv("ML_AIR_EVENT_SCHEMA_REGISTRY_ENABLED", "0").strip() == "1"


def default_retention_days() -> int:
    raw = os.getenv("ML_AIR_EVENT_RETENTION_DEFAULT_DAYS", "90").strip()
    try:
        return max(1, min(int(raw), 3650))
    except ValueError:
        return 90
