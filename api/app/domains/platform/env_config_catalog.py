"""Canonical catalog of MLAir env / L4 settings keys (from .env.example + infra).

Used by Hub Platform Settings to present a complete, normalized configuration surface.
Keys marked ``layer=l4`` are editable via ``system_settings``; ``env`` / ``compose`` /
``secret`` are process/bootstrap configuration (view-only in Hub, change via `.env`).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.settings.feature_env_map import feature_env_map

Layer = Literal["l4", "env", "compose", "secret"]
ValueType = Literal["bool", "int", "float", "string", "url", "secret", "json"]


@dataclass(frozen=True, slots=True)
class CatalogEntry:
    key: str
    section: str
    value_type: ValueType
    layer: Layer
    description: str
    l4_path: str | None = None
    restart_required: bool = False
    example_default: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _feature_entries() -> list[CatalogEntry]:
    labels = {
        "usage_tracking": "Track resource usage samples for runs/tasks",
        "resource_monitor": "Enable in-process resource monitor",
        "strict_dataset_version_required": "Require pinned dataset_version_id for training",
        "strict_dataset_version_all_post_runs": "Require pin on all POST /runs",
        "readiness_allow_legacy_fallback": "Allow legacy latest-head readiness fallback",
        "skip_approval_for_promote": "Skip approval gate for promote (dev)",
        "warn_implicit_dataset_head": "Warn when resolving implicit dataset head",
        "lineage_legacy_default_version_label": "Legacy lineage default version label",
        "dataset_hub_v2": "Dataset Hub v2 UI/API surfaces",
        "scope_debug_panel": "Show Hub scope debug panel",
        "serving_slots_http": "Enable model serving slots HTTP API",
        "otel_enabled": "OpenTelemetry instrumentation",
        "event_outbox": "Durable semantic event outbox",
        "event_stream": "Semantic event stream",
        "event_stream_global_fanout": "Global fan-out for event stream",
        "execution_projection": "Execution projection surfaces",
        "semantic_event_signing": "Sign semantic realtime events",
        "semantic_event_validate": "Validate semantic event envelopes",
        "semantic_webhook_delivery": "Deliver semantic webhooks",
        "semantic_webhook_dedupe": "Dedupe semantic webhook deliveries",
        "readiness_async_queue": "Async readiness evaluation queue",
        "tenant_quota_enforce": "Enforce tenant catalog quotas",
        "dataset_retention_policies": "Dataset retention policies",
        "http_pipeline_tasks": "HTTP pipeline tasks surface",
        "http_task_templates": "HTTP task templates surface",
        "validate_plugin_exists_on_create": "Validate plugin exists on run create",
        "require_declared_dataset_inputs": "Require declared pipeline dataset inputs",
        "validate_dataset_version_checksum": "Validate dataset version checksums",
        "rollback_enabled": "Allow model stage rollback",
        "rollback_requires_approval": "Require approval for rollback",
        "promotion_allow_skip_stages": "Allow skipping forward promotion stages",
        "replay_require_checksum": "Require checksum evidence for replay",
        "replay_require_signed_manifest": "Require signed manifest for replay",
        "manifest_strict_key_lifecycle": "Strict manifest signing key lifecycle",
        "plugin_version_enforcement": "Enforce plugin version compatibility",
        "legacy_static_tokens": "Allow legacy static bearer tokens",
        "projections_enabled": "Projection write path (timeline, activity, dashboard)",
        "timeline_projection_reads": "Read timeline from projection store",
        "dashboard_projection_reads": "Read dashboard from projection store",
        "notification_delivery": "Notification channel delivery",
        "integration_delivery": "External integration subscriptions",
        "event_retention_enabled": "Event retention policies and background purge",
        "siem_export_enabled": "SIEM export subscriptions",
        "event_schema_registry_enabled": "Domain event schema registry",
        "multi_cluster": "Multi-cluster registry and agent heartbeat",
        "multi_region": "Multi-region registry and failover",
        "federation": "Federated control plane (Global/APAC/EU/US)",
        "edge_deployment": "Edge / on-prem deployment sync",
        "global_scheduler": "Global scheduler (region→cluster→node)",
        "cross_region_replication": "Cross-region metadata replication",
        "disaster_recovery": "DR snapshots and restore",
        "global_identity": "Global identity federation / trust",
        "global_observability": "Global observability dashboard",
        "extension_platform": "SDK extension platform registry",
        "domain_event_outbox": "Domain event outbox drain",
        "domain_webhook_delivery": "Domain webhook HTTP delivery",
        "domain_webhook_dedupe": "Domain webhook deduplication",
    }
    out: list[CatalogEntry] = []
    for feature_key, env_key in feature_env_map().items():
        out.append(
            CatalogEntry(
                key=env_key,
                section="features",
                value_type="bool",
                layer="l4",
                description=labels.get(feature_key, feature_key.replace("_", " ")),
                l4_path=f"features.{feature_key}",
                restart_required=False,
            )
        )
    # Extra feature keys seeded in L4 but not always in FEATURE_ENV_MAP
    for feature_key, env_key in (
        ("plugin_version_enforcement", "MLAIR_PLUGIN_VERSION_ENFORCE"),
        ("legacy_static_tokens", "ML_AIR_LEGACY_STATIC_TOKENS"),
    ):
        if any(e.key == env_key for e in out):
            continue
        out.append(
            CatalogEntry(
                key=env_key,
                section="features",
                value_type="bool",
                layer="l4",
                description=labels.get(feature_key, feature_key),
                l4_path=f"features.{feature_key}",
            )
        )
    return out


def build_env_config_catalog() -> list[CatalogEntry]:
    """Full normalized catalog covering .env.example + deploy/.env.infra.example."""
    entries: list[CatalogEntry] = [
        # --- A. Infrastructure (env-only) ---
        CatalogEntry("ML_AIR_DATABASE_URL", "infrastructure", "url", "secret", "Postgres connection URL", restart_required=True, example_default="postgresql://mlair:mlair@postgres:5432/mlair"),
        CatalogEntry("ML_AIR_REDIS_URL", "infrastructure", "url", "secret", "Redis connection URL", restart_required=True, example_default="redis://redis:6379/0"),
        CatalogEntry("ML_AIR_API_BASE_URL", "infrastructure", "url", "env", "Internal API base URL for scheduler/executor", restart_required=True, example_default="http://api:8080"),
        CatalogEntry("MLAIR_PORT", "infrastructure", "int", "compose", "Public Hub/all-in-one host port", restart_required=True, example_default="8080"),
        CatalogEntry("ML_AIR_API_PORT", "infrastructure", "int", "compose", "Host-mapped API port (microservices)", restart_required=True, example_default="8080"),
        CatalogEntry("ML_AIR_FRONTEND_PORT", "infrastructure", "int", "compose", "Host-mapped frontend port", restart_required=True, example_default="38080"),
        CatalogEntry("ML_AIR_REDIS_PORT", "infrastructure", "int", "compose", "Host-mapped Redis port", restart_required=True, example_default="36379"),
        CatalogEntry("ML_AIR_POSTGRES_PORT", "infrastructure", "int", "compose", "Host-mapped Postgres port", restart_required=True, example_default="35432"),
        CatalogEntry("ML_AIR_SCHEDULER_METRICS_PORT", "infrastructure", "int", "compose", "Scheduler metrics port", restart_required=True, example_default="9102"),
        CatalogEntry("ML_AIR_EXECUTOR_METRICS_PORT", "infrastructure", "int", "compose", "Executor metrics port", restart_required=True, example_default="9103"),
        CatalogEntry("ML_AIR_REALTIME_METRICS_PORT", "infrastructure", "int", "compose", "Realtime metrics port", restart_required=True, example_default="9104"),
        CatalogEntry("MLAIR_REALTIME_PORT", "infrastructure", "int", "compose", "Realtime service port", restart_required=True, example_default="8001"),
        CatalogEntry("ML_AIR_MINIO_API_PORT", "infrastructure", "int", "compose", "MinIO API host port", restart_required=True, example_default="9000"),
        CatalogEntry("ML_AIR_MINIO_CONSOLE_PORT", "infrastructure", "int", "compose", "MinIO console host port", restart_required=True, example_default="9001"),
        CatalogEntry("ML_AIR_PROMETHEUS_PORT", "infrastructure", "int", "compose", "Prometheus host port", restart_required=True, example_default="39090"),
        CatalogEntry("ML_AIR_GRAFANA_PORT", "infrastructure", "int", "compose", "Grafana host port", restart_required=True, example_default="33000"),
        # --- B. Secrets ---
        CatalogEntry("ML_AIR_IDENTITY_JWT_SECRET", "secrets", "secret", "secret", "Identity access JWT signing secret", restart_required=True),
        CatalogEntry("ML_AIR_BOOTSTRAP_ADMIN_USERNAME", "secrets", "string", "env", "One-time bootstrap Global Admin username", restart_required=True, example_default="admin"),
        CatalogEntry("ML_AIR_BOOTSTRAP_ADMIN_PASSWORD", "secrets", "secret", "secret", "One-time bootstrap Global Admin password", restart_required=True),
        CatalogEntry("ML_AIR_SA_SCHEDULER_SECRET", "secrets", "secret", "secret", "Platform scheduler service-account secret", restart_required=True),
        CatalogEntry("ML_AIR_SA_EXECUTOR_SECRET", "secrets", "secret", "secret", "Platform executor service-account secret", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_SIGNING_KEY", "secrets", "secret", "secret", "Default manifest HMAC signing key", restart_required=True),
        CatalogEntry("ML_AIR_JWT_HS256_SECRET", "secrets", "secret", "secret", "Legacy HS256 JWT secret", restart_required=True),
        CatalogEntry("ML_AIR_SEMANTIC_EVENT_SIGNING_KEY", "secrets", "secret", "secret", "Semantic event signing key", restart_required=True),
        CatalogEntry("ML_AIR_TRACKING_TOKEN", "secrets", "secret", "secret", "Legacy tracking token", restart_required=True),
        CatalogEntry("ML_AIR_AUTH_TOKENS_JSON", "secrets", "json", "secret", "Legacy static auth tokens JSON", restart_required=True),
        CatalogEntry("ML_AIR_WORKER_TOKEN", "secrets", "secret", "secret", "Legacy worker token", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_ED25519_PRIVATE_KEY", "secrets", "secret", "secret", "Manifest Ed25519 private key", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_ED25519_PRIVATE_KEYS_JSON", "secrets", "json", "secret", "Manifest Ed25519 private keys JSON", restart_required=True),
        CatalogEntry("POSTGRES_PASSWORD", "secrets", "secret", "secret", "Compose Postgres password", restart_required=True),
        CatalogEntry("MINIO_ROOT_PASSWORD", "secrets", "secret", "secret", "Compose MinIO root password", restart_required=True),
        CatalogEntry("GF_SECURITY_ADMIN_PASSWORD", "secrets", "secret", "secret", "Compose Grafana admin password", restart_required=True),
        CatalogEntry("MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN", "secrets", "secret", "secret", "Reserved promote webhook bearer (Phase 2; use semantic webhooks today)", restart_required=False),
        # --- C. Storage / runtime (L4) ---
        CatalogEntry("ML_AIR_DATASET_ARTIFACT_ROOT", "runtime", "url", "l4", "Default dataset artifact root URI", l4_path="runtime.dataset_artifact_root", example_default="file:///mlair/artifacts/datasets"),
        CatalogEntry("ML_AIR_DEFAULT_MODEL_ARTIFACT_ROOT", "runtime", "url", "l4", "Default model artifact root URI", l4_path="runtime.model_artifact_root", example_default="file:///mlair/artifacts/models"),
        CatalogEntry("ML_AIR_TASK_EXECUTION_MODE", "runtime", "string", "l4", "Task execution mode: internal | external", l4_path="runtime.task_execution_mode", example_default="external"),
        CatalogEntry("ML_AIR_TASK_LEASE_SECONDS", "runtime", "int", "l4", "External worker lease TTL (seconds)", l4_path="runtime.task_lease_seconds", example_default="300"),
        CatalogEntry("ML_AIR_LEASE_REAP_INTERVAL_SECONDS", "runtime", "int", "l4", "Lease reaper interval (seconds)", l4_path="runtime.lease_reap_interval_seconds", example_default="5"),
        CatalogEntry("ML_AIR_LOG_LEVEL", "runtime", "string", "l4", "API/process log level", l4_path="runtime.log_level", restart_required=True, example_default="INFO"),
        CatalogEntry("ML_AIR_RESOURCE_SAMPLE_INTERVAL", "runtime", "float", "l4", "Resource sample interval (seconds)", l4_path="runtime.resource_sample_interval", example_default="1"),
        CatalogEntry("ML_AIR_RESOURCE_FLUSH_INTERVAL", "runtime", "float", "l4", "Resource flush interval (seconds)", l4_path="runtime.resource_flush_interval", example_default="1"),
        CatalogEntry("ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE", "runtime", "bool", "l4", "Require artifact evidence for replay gating", l4_path="runtime.replay_require_artifact_evidence", example_default="1"),
        CatalogEntry("ML_AIR_ENVIRONMENT", "runtime", "string", "env", "Deployment environment label", restart_required=True, example_default="development"),
        CatalogEntry("MLAIR_PROFILE", "runtime", "string", "env", "Config profile (development|staging|production|microservices)", restart_required=True, example_default="development"),
        # --- Hub / identity / governance L4 ---
        CatalogEntry("ML_AIR_HUB_DEFAULT_ROUTE", "hub", "string", "l4", "Default Hub landing route", l4_path="hub.default_route", example_default="datasets"),
        CatalogEntry("ML_AIR_IDENTITY_LOCKOUT_THRESHOLD", "identity", "int", "l4", "Failed-login lockout threshold", l4_path="identity.lockout_threshold", example_default="5"),
        CatalogEntry("ML_AIR_IDENTITY_LOCKOUT_MINUTES", "identity", "int", "l4", "Account lockout duration (minutes)", l4_path="identity.lockout_minutes", example_default="15"),
        CatalogEntry("ML_AIR_IDENTITY_PASSWORD_MIN_LENGTH", "identity", "int", "l4", "Minimum password length", l4_path="identity.password_min_length", example_default="8"),
        CatalogEntry("ML_AIR_IDENTITY_ACCESS_TOKEN_TTL_SECONDS", "identity", "int", "l4", "Access token TTL (seconds)", l4_path="identity.access_token_ttl_seconds", example_default="900"),
        CatalogEntry("ML_AIR_IDENTITY_REFRESH_TOKEN_TTL_SECONDS", "identity", "int", "l4", "Refresh token TTL (seconds)", l4_path="identity.refresh_token_ttl_seconds", example_default="604800"),
        CatalogEntry("ML_AIR_PROMOTION_STAGE_ORDER", "governance", "string", "l4", "Promotion stage order (comma-separated)", l4_path="governance.promotion_stage_order"),
        CatalogEntry("ML_AIR_PROMOTION_APPROVAL_STAGES", "governance", "string", "l4", "Stages requiring approval", l4_path="governance.promotion_approval_stages"),
        CatalogEntry("ML_AIR_WEBHOOK_ALLOWED_HOSTS", "governance", "string", "l4", "Platform webhook allowlist hosts", l4_path="governance.webhook_allowed_hosts"),
        CatalogEntry("ML_AIR_QUOTA_MAX_PROJECTS", "governance", "int", "l4", "Default max projects quota", l4_path="governance.quota_defaults.max_projects"),
        CatalogEntry("ML_AIR_QUOTA_MAX_DATASETS_PER_PROJECT", "governance", "int", "l4", "Default max datasets per project", l4_path="governance.quota_defaults.max_datasets_per_project"),
        CatalogEntry("ML_AIR_QUOTA_MAX_MODELS_PER_PROJECT", "governance", "int", "l4", "Default max models per project", l4_path="governance.quota_defaults.max_models_per_project"),
        CatalogEntry("ML_AIR_QUOTA_MAX_RUNS_PER_PROJECT", "governance", "int", "l4", "Default max runs per project", l4_path="governance.quota_defaults.max_runs_per_project"),
        CatalogEntry("ML_AIR_QUOTA_MAX_WEBHOOKS_PER_PROJECT", "governance", "int", "l4", "Default max webhook subscriptions", l4_path="governance.quota_defaults.max_webhook_subscriptions_per_project"),
        CatalogEntry("ML_AIR_QUOTA_MAX_PARALLEL_TASKS", "governance", "int", "l4", "Default max parallel tasks", l4_path="governance.quota_defaults.max_parallel_tasks"),
        # --- Telemetry L4 ---
        CatalogEntry("ML_AIR_GRAFANA_URL", "telemetry", "url", "l4", "Grafana UI URL for Hub links", l4_path="telemetry.grafana_ui_url"),
        CatalogEntry("ML_AIR_TRACE_SPAN_RETENTION_DAYS", "telemetry", "int", "l4", "Trace span retention (days)", l4_path="telemetry.trace_span_retention_days", example_default="30"),
        CatalogEntry("ML_AIR_TRACE_SAMPLE_RATIO", "telemetry", "float", "l4", "Trace sample ratio 0–1", l4_path="telemetry.trace_sample_ratio", example_default="1.0"),
        CatalogEntry("ML_AIR_PROMETHEUS_URL", "telemetry", "url", "env", "Prometheus URL for scripts/drills"),
        CatalogEntry("ML_AIR_OTEL_ENABLED", "telemetry", "bool", "l4", "OpenTelemetry enabled", l4_path="features.otel_enabled"),
        CatalogEntry("ML_AIR_SEMANTIC_EVENT_SIGNING", "telemetry", "bool", "l4", "Semantic event signing", l4_path="features.semantic_event_signing"),
        CatalogEntry("ML_AIR_SEMANTIC_EVENT_VALIDATE", "telemetry", "bool", "l4", "Validate semantic events", l4_path="features.semantic_event_validate"),
        CatalogEntry("ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID", "telemetry", "string", "env", "Active semantic signing key id", restart_required=True, example_default="v1"),
        CatalogEntry("ML_AIR_SEMANTIC_EVENT_SIGNING_KEYS_JSON", "telemetry", "json", "secret", "Semantic signing keyring JSON", restart_required=True),
        # --- Compose / images ---
        CatalogEntry("MLAIR_IMAGE", "compose", "string", "compose", "All-in-one image tag", restart_required=True, example_default="ml-air:latest"),
        CatalogEntry("MLAIR_API_IMAGE", "compose", "string", "compose", "API image tag", restart_required=True),
        CatalogEntry("MLAIR_SCHEDULER_IMAGE", "compose", "string", "compose", "Scheduler image tag", restart_required=True),
        CatalogEntry("MLAIR_EXECUTOR_IMAGE", "compose", "string", "compose", "Executor image tag", restart_required=True),
        CatalogEntry("MLAIR_FRONTEND_IMAGE", "compose", "string", "compose", "Frontend image tag", restart_required=True),
        CatalogEntry("MLAIR_REALTIME_IMAGE", "compose", "string", "compose", "Realtime image tag", restart_required=True),
        CatalogEntry("COMPOSE_FILE", "compose", "string", "compose", "Docker Compose file path", restart_required=True),
        CatalogEntry("MLAIR_COMPOSE_FILE", "compose", "string", "compose", "MLAir compose file override", restart_required=True),
        CatalogEntry("COMPOSE_PROFILES", "compose", "string", "compose", "Active compose profiles", restart_required=True),
        CatalogEntry("MLAIR_INFRA_MINIO", "compose", "bool", "compose", "Enable MinIO sidecar", restart_required=True, example_default="0"),
        CatalogEntry("MLAIR_INFRA_PROMETHEUS", "compose", "bool", "compose", "Enable Prometheus sidecar", restart_required=True, example_default="0"),
        CatalogEntry("MLAIR_INFRA_GRAFANA", "compose", "bool", "compose", "Enable Grafana sidecar", restart_required=True, example_default="0"),
        CatalogEntry("POSTGRES_USER", "compose", "string", "compose", "Compose Postgres user", restart_required=True),
        CatalogEntry("POSTGRES_DB", "compose", "string", "compose", "Compose Postgres database", restart_required=True),
        CatalogEntry("MINIO_ROOT_USER", "compose", "string", "compose", "Compose MinIO root user", restart_required=True),
        CatalogEntry("GF_SECURITY_ADMIN_USER", "compose", "string", "compose", "Compose Grafana admin user", restart_required=True),
        CatalogEntry("GF_USERS_ALLOW_SIGN_UP", "compose", "bool", "compose", "Allow Grafana sign-up", restart_required=True),
        CatalogEntry("ML_AIR_PYTHON_BASE_IMAGE", "compose", "string", "compose", "Python base image for builds", restart_required=True),
        # --- Frontend / browser ---
        CatalogEntry("NEXT_PUBLIC_API_BASE_URL", "frontend", "url", "env", "Browser API base (empty = same-origin)", restart_required=True),
        CatalogEntry("NEXT_PUBLIC_MLAIR_REALTIME_WS", "frontend", "url", "env", "Browser realtime WS URL", restart_required=True),
        CatalogEntry("MLAIR_NEXT_INTERNAL_API_URL", "frontend", "url", "env", "Next.js server-side API URL", restart_required=True),
        CatalogEntry("ML_AIR_RUNTIME_API_BASE_URL", "frontend", "url", "env", "Runtime-config API override", restart_required=False),
        CatalogEntry("ML_AIR_RUNTIME_REALTIME_BASE_URL", "frontend", "url", "env", "Runtime-config realtime WS override", restart_required=False),
        CatalogEntry("ML_AIR_RUNTIME_REALTIME_DEFAULT_URL", "frontend", "url", "env", "Fallback realtime WS URL", restart_required=False),
        # --- Auth extras ---
        CatalogEntry("ML_AIR_JWT_ISSUER", "auth", "string", "env", "JWT issuer claim", restart_required=True),
        CatalogEntry("ML_AIR_JWT_AUDIENCE", "auth", "string", "env", "JWT audience claim", restart_required=True),
        CatalogEntry("ML_AIR_JWT_JWKS_URL", "auth", "url", "env", "External JWKS URL", restart_required=True),
        CatalogEntry("ML_AIR_JWT_JWKS_CACHE_TTL_SECONDS", "auth", "int", "env", "JWKS cache TTL", restart_required=True, example_default="300"),
        # --- Manifest ---
        CatalogEntry("ML_AIR_MANIFEST_ACTIVE_KEY_ID", "manifest", "string", "env", "Active manifest key id", restart_required=True, example_default="v1"),
        CatalogEntry("ML_AIR_MANIFEST_SIGNING_KEYS_JSON", "manifest", "json", "secret", "Manifest HMAC keyring JSON", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_KEY_PROVIDER", "manifest", "string", "env", "Manifest key provider", restart_required=True, example_default="env"),
        CatalogEntry("ML_AIR_MANIFEST_MANAGED_KEYS_FILE", "manifest", "string", "env", "Managed keys file path", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_ALLOWED_KEY_IDS", "manifest", "string", "env", "Allowed manifest key ids", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_SIGNING_ALGORITHM", "manifest", "string", "env", "Manifest signing algorithm", restart_required=True, example_default="hmac-sha256"),
        CatalogEntry("ML_AIR_MANIFEST_ED25519_PUBLIC_KEY", "manifest", "string", "env", "Manifest Ed25519 public key", restart_required=True),
        CatalogEntry("ML_AIR_MANIFEST_ED25519_PUBLIC_KEYS_JSON", "manifest", "json", "env", "Manifest Ed25519 public keys JSON", restart_required=True),
        # --- Integrations ---
        CatalogEntry("MLAIR_MODEL_PROMOTE_WEBHOOK_URL", "integrations", "url", "env", "Reserved promote webhook URL (not wired in Phase 1)"),
        CatalogEntry("MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS", "integrations", "int", "env", "Reserved promote webhook timeout", example_default="15"),
        CatalogEntry("ML_AIR_DOCKER_IMAGE", "integrations", "string", "env", "Run environment docker image label"),
        CatalogEntry("MLAIR_SOURCE_COMMIT", "integrations", "string", "env", "Source commit for run environment"),
        CatalogEntry("MLAIR_SOURCE_BRANCH", "integrations", "string", "env", "Source branch for run environment"),
        CatalogEntry("OTEL_SERVICE_NAME_SCHEDULER", "integrations", "string", "env", "OTel service name for scheduler"),
        CatalogEntry("OTEL_SERVICE_NAME_EXECUTOR", "integrations", "string", "env", "OTel service name for executor"),
        CatalogEntry("OTEL_SERVICE_NAME_REALTIME", "integrations", "string", "env", "OTel service name for realtime"),
    ]
    entries.extend(_feature_entries())
    # Deduplicate by key (first wins for non-feature; features appended may override descriptions)
    by_key: dict[str, CatalogEntry] = {}
    for entry in entries:
        existing = by_key.get(entry.key)
        if existing is None or (existing.layer != "l4" and entry.layer == "l4"):
            by_key[entry.key] = entry
    return sorted(by_key.values(), key=lambda e: (e.section, e.key))


def catalog_sections() -> list[str]:
    return sorted({e.section for e in build_env_config_catalog()})
