"""Phase 6 Distributed feature flags."""

from __future__ import annotations

from app.domains.shared.runtime_feature import settings_feature


def multi_cluster_enabled() -> bool:
    return settings_feature("multi_cluster", "ML_AIR_MULTI_CLUSTER")


def multi_region_enabled() -> bool:
    return settings_feature("multi_region", "ML_AIR_MULTI_REGION")


def federation_enabled() -> bool:
    return settings_feature("federation", "ML_AIR_FEDERATION")


def edge_deployment_enabled() -> bool:
    return settings_feature("edge_deployment", "ML_AIR_EDGE_DEPLOYMENT")


def global_scheduler_enabled() -> bool:
    return settings_feature("global_scheduler", "ML_AIR_GLOBAL_SCHEDULER")


def cross_region_replication_enabled() -> bool:
    return settings_feature("cross_region_replication", "ML_AIR_CROSS_REGION_REPLICATION")


def disaster_recovery_enabled() -> bool:
    return settings_feature("disaster_recovery", "ML_AIR_DISASTER_RECOVERY")


def global_identity_enabled() -> bool:
    return settings_feature("global_identity", "ML_AIR_GLOBAL_IDENTITY")


def global_observability_enabled() -> bool:
    return settings_feature("global_observability", "ML_AIR_GLOBAL_OBSERVABILITY")


def extension_platform_enabled() -> bool:
    return settings_feature("extension_platform", "ML_AIR_EXTENSION_PLATFORM")
