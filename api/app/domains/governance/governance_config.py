"""Phase 4 governance feature flags."""

from __future__ import annotations

import os

from app.domains.shared.runtime_feature import settings_feature


def event_retention_enabled() -> bool:
    return settings_feature("event_retention_enabled", "ML_AIR_EVENT_RETENTION_ENABLED")


def siem_export_enabled() -> bool:
    return settings_feature("siem_export_enabled", "ML_AIR_SIEM_EXPORT_ENABLED")


def event_schema_registry_enabled() -> bool:
    return settings_feature("event_schema_registry_enabled", "ML_AIR_EVENT_SCHEMA_REGISTRY_ENABLED")


def default_retention_days() -> int:
    raw = os.getenv("ML_AIR_EVENT_RETENTION_DEFAULT_DAYS", "90").strip()
    try:
        return max(1, min(int(raw), 3650))
    except ValueError:
        return 90
