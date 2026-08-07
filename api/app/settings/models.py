"""Typed configuration models (Package 002 Phase 1)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class FeatureFlags:
    usage_tracking: bool
    resource_monitor: bool
    strict_dataset_version_required: bool
    strict_dataset_version_all_post_runs: bool
    readiness_allow_legacy_fallback: bool
    skip_approval_for_promote: bool
    warn_implicit_dataset_head: bool
    lineage_legacy_default_version_label: bool
    dataset_hub_v2: bool
    scope_debug_panel: bool
    serving_slots_http: bool
    otel_enabled: bool
    event_outbox: bool
    domain_event_outbox: bool
    domain_webhook_delivery: bool
    domain_webhook_dedupe: bool
    event_stream: bool
    event_stream_global_fanout: bool
    execution_projection: bool
    semantic_event_signing: bool
    semantic_event_validate: bool
    semantic_webhook_delivery: bool
    semantic_webhook_dedupe: bool
    readiness_async_queue: bool
    tenant_quota_enforce: bool
    dataset_retention_policies: bool
    http_pipeline_tasks: bool
    http_task_templates: bool
    validate_plugin_exists_on_create: bool
    require_declared_dataset_inputs: bool
    validate_dataset_version_checksum: bool
    rollback_enabled: bool
    rollback_requires_approval: bool
    promotion_allow_skip_stages: bool
    replay_require_checksum: bool
    replay_require_signed_manifest: bool
    manifest_strict_key_lifecycle: bool
    plugin_version_enforcement: bool
    legacy_static_tokens: bool
    projections_enabled: bool
    timeline_projection_reads: bool
    dashboard_projection_reads: bool
    notification_delivery: bool
    integration_delivery: bool
    event_retention_enabled: bool
    siem_export_enabled: bool
    event_schema_registry_enabled: bool
    cost_aware_scheduler: bool
    ai_gateway: bool
    chargeback: bool
    prompt_management: bool
    policy_engine: bool
    copilot: bool
    multi_cluster: bool
    multi_region: bool
    federation: bool
    edge_deployment: bool
    global_scheduler: bool
    cross_region_replication: bool
    disaster_recovery: bool
    global_identity: bool
    global_observability: bool
    extension_platform: bool


@dataclass(frozen=True, slots=True)
class AuthSettings:
    auth_tokens_json: str
    jwt_hs256_secret: str
    mfa_secret_key: str
    jwt_issuer: str
    jwt_audience: str
    jwt_jwks_url: str
    jwt_jwks_cache_ttl_seconds: int
    worker_token: str
    legacy_static_tokens: bool


@dataclass(frozen=True, slots=True)
class IdentitySettings:
    lockout_threshold: int
    lockout_minutes: int
    password_min_length: int
    access_token_ttl_seconds: int
    refresh_token_ttl_seconds: int


@dataclass(frozen=True, slots=True)
class PromotionSettings:
    stage_order: tuple[str, ...]
    rollback_enabled: bool
    rollback_requires_approval: bool
    allow_skip_forward_stages: bool
    skip_approval_for_promote: bool
    approval_stages: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ObservabilitySettings:
    grafana_url: str | None
    trace_span_retention_days: int
    trace_sample_ratio: float


@dataclass(frozen=True, slots=True)
class Settings:
    profile: str
    environment: str
    default_tenant: str
    default_project: str
    hub_default_route: str
    features: FeatureFlags
    auth: AuthSettings
    identity: IdentitySettings
    promotion: PromotionSettings
    observability: ObservabilitySettings

    def runtime_features(self) -> dict[str, bool]:
        """Shape for ``GET /v1/runtime-config`` feature flags."""
        f = self.features
        return {
            "realtime_enabled": True,
            "dataset_hub_v2": f.dataset_hub_v2,
            "strict_dataset_version_required": f.strict_dataset_version_required,
            "strict_dataset_version_all_post_runs": f.strict_dataset_version_all_post_runs,
            "readiness_allow_legacy_fallback": f.readiness_allow_legacy_fallback,
            "scope_debug_panel": f.scope_debug_panel,
            "serving_slots_http": f.serving_slots_http,
            "semantic_event_outbox": f.event_outbox,
            "domain_event_outbox": f.domain_event_outbox,
            "domain_webhook_delivery": f.domain_webhook_delivery,
            "domain_webhook_dedupe": f.domain_webhook_dedupe,
            "semantic_event_stream": f.event_stream,
            "semantic_event_stream_global_fanout": f.event_stream_global_fanout,
            "execution_projection": f.execution_projection,
            "semantic_webhook_delivery": f.semantic_webhook_delivery,
            "semantic_webhook_dedupe": f.semantic_webhook_dedupe,
            "opentelemetry": f.otel_enabled,
            "dataset_retention_policies": f.dataset_retention_policies,
            "identity_login": True,
            "legacy_static_tokens": f.legacy_static_tokens,
            "http_pipeline_tasks": f.http_pipeline_tasks,
            "http_task_templates": f.http_task_templates,
            "plugin_version_enforcement": f.plugin_version_enforcement,
            "promotion_stage_order": list(self.promotion.stage_order),
            "promotion_allow_skip_stages": self.promotion.allow_skip_forward_stages,
            "rollback_enabled": self.promotion.rollback_enabled,
            "rollback_requires_approval": self.promotion.rollback_requires_approval,
            "projections_enabled": f.projections_enabled,
            "timeline_projection_reads": f.timeline_projection_reads,
            "dashboard_projection_reads": f.dashboard_projection_reads,
            "notification_delivery": f.notification_delivery,
            "integration_delivery": f.integration_delivery,
            "event_retention_enabled": f.event_retention_enabled,
            "siem_export_enabled": f.siem_export_enabled,
            "event_schema_registry_enabled": f.event_schema_registry_enabled,
            "cost_aware_scheduler": f.cost_aware_scheduler,
            "ai_gateway": f.ai_gateway,
            "chargeback": f.chargeback,
            "prompt_management": f.prompt_management,
            "policy_engine": f.policy_engine,
            "copilot": f.copilot,
            "multi_cluster": f.multi_cluster,
            "multi_region": f.multi_region,
            "federation": f.federation,
            "edge_deployment": f.edge_deployment,
            "global_scheduler": f.global_scheduler,
            "cross_region_replication": f.cross_region_replication,
            "disaster_recovery": f.disaster_recovery,
            "global_identity": f.global_identity,
            "global_observability": f.global_observability,
            "extension_platform": f.extension_platform,
        }
