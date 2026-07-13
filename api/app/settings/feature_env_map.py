"""Feature flag → env alias map (API fallback when ``mlair`` package is unavailable)."""

from __future__ import annotations

FEATURE_ENV_MAP: dict[str, str] = {
    "usage_tracking": "ML_AIR_USAGE_TRACKING_ENABLED",
    "resource_monitor": "ML_AIR_RESOURCE_MONITOR_ENABLED",
    "strict_dataset_version_required": "ML_AIR_STRICT_DATASET_VERSION_REQUIRED",
    "strict_dataset_version_all_post_runs": "ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS",
    "readiness_allow_legacy_fallback": "ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK",
    "skip_approval_for_promote": "ML_AIR_SKIP_APPROVAL_FOR_PROMOTE",
    "warn_implicit_dataset_head": "ML_AIR_WARN_IMPLICIT_DATASET_HEAD",
    "lineage_legacy_default_version_label": "ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL",
    "dataset_hub_v2": "ML_AIR_FEATURE_DATASET_HUB_V2",
    "scope_debug_panel": "ML_AIR_FEATURE_SCOPE_DEBUG_PANEL",
    "serving_slots_http": "ML_AIR_ENABLE_SERVING_SLOTS_HTTP",
    "otel_enabled": "ML_AIR_OTEL_ENABLED",
    "event_outbox": "ML_AIR_EVENT_OUTBOX",
    "event_stream": "ML_AIR_EVENT_STREAM",
    "event_stream_global_fanout": "ML_AIR_EVENT_STREAM_GLOBAL_FANOUT",
    "execution_projection": "ML_AIR_EXECUTION_PROJECTION",
    "semantic_event_signing": "ML_AIR_SEMANTIC_EVENT_SIGNING",
    "semantic_event_validate": "ML_AIR_SEMANTIC_EVENT_VALIDATE",
    "semantic_webhook_delivery": "ML_AIR_SEMANTIC_WEBHOOK_DELIVERY",
    "semantic_webhook_dedupe": "ML_AIR_SEMANTIC_WEBHOOK_DEDUPE",
    "readiness_async_queue": "ML_AIR_READINESS_ASYNC_QUEUE",
    "tenant_quota_enforce": "ML_AIR_TENANT_QUOTA_ENFORCE",
    "dataset_retention_policies": "ML_AIR_DATASET_RETENTION_POLICIES",
    "http_pipeline_tasks": "ML_AIR_HTTP_PIPELINE_TASKS",
    "http_task_templates": "ML_AIR_HTTP_TASK_TEMPLATES",
    "validate_plugin_exists_on_create": "ML_AIR_VALIDATE_PLUGIN_EXISTS_ON_CREATE",
    "require_declared_dataset_inputs": "ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS",
    "validate_dataset_version_checksum": "ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM",
    "rollback_enabled": "ML_AIR_ROLLBACK_ENABLED",
    "rollback_requires_approval": "ML_AIR_ROLLBACK_REQUIRES_APPROVAL",
    "promotion_allow_skip_stages": "ML_AIR_PROMOTION_ALLOW_SKIP_STAGES",
    "replay_require_checksum": "ML_AIR_REPLAY_REQUIRE_CHECKSUM",
    "replay_require_signed_manifest": "ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST",
    "manifest_strict_key_lifecycle": "ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE",
}


def feature_env_map() -> dict[str, str]:
    try:
        from mlair.config.loader import _FEATURE_ENV_MAP

        return dict(_FEATURE_ENV_MAP)
    except ImportError:
        return dict(FEATURE_ENV_MAP)
