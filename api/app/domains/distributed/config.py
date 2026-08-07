"""Phase 6 Distributed Control Plane feature flags."""

from __future__ import annotations

import os


def multi_cluster_enabled() -> bool:
    return os.getenv("ML_AIR_MULTI_CLUSTER", "0").strip() == "1"


def multi_region_enabled() -> bool:
    return os.getenv("ML_AIR_MULTI_REGION", "0").strip() == "1"


def federation_enabled() -> bool:
    return os.getenv("ML_AIR_FEDERATION", "0").strip() == "1"


def edge_deployment_enabled() -> bool:
    return os.getenv("ML_AIR_EDGE_DEPLOYMENT", "0").strip() == "1"


def global_scheduler_enabled() -> bool:
    return os.getenv("ML_AIR_GLOBAL_SCHEDULER", "0").strip() == "1"


def cross_region_replication_enabled() -> bool:
    return os.getenv("ML_AIR_CROSS_REGION_REPLICATION", "0").strip() == "1"


def disaster_recovery_enabled() -> bool:
    return os.getenv("ML_AIR_DISASTER_RECOVERY", "0").strip() == "1"


def global_identity_enabled() -> bool:
    return os.getenv("ML_AIR_GLOBAL_IDENTITY", "0").strip() == "1"


def global_observability_enabled() -> bool:
    return os.getenv("ML_AIR_GLOBAL_OBSERVABILITY", "0").strip() == "1"


def extension_platform_enabled() -> bool:
    return os.getenv("ML_AIR_EXTENSION_PLATFORM", "0").strip() == "1"
