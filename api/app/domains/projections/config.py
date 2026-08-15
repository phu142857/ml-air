"""Phase 3 projection feature flags."""

from __future__ import annotations

from app.domains.shared.runtime_feature import settings_feature


def projections_enabled() -> bool:
    return settings_feature("projections_enabled", "ML_AIR_PROJECTIONS_ENABLED")


def timeline_projection_reads_enabled() -> bool:
    return settings_feature("timeline_projection_reads", "ML_AIR_TIMELINE_PROJECTION_READS")


def dashboard_projection_reads_enabled() -> bool:
    return settings_feature("dashboard_projection_reads", "ML_AIR_DASHBOARD_PROJECTION_READS")


def notification_delivery_enabled() -> bool:
    return settings_feature("notification_delivery", "ML_AIR_NOTIFICATION_DELIVERY")


def integration_delivery_enabled() -> bool:
    return settings_feature("integration_delivery", "ML_AIR_INTEGRATION_DELIVERY")
