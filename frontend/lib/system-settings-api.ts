/** L4 system settings API (global admin). */

import { getApiBaseUrl } from "./api";

export type SystemSettingsDocument = {
  schema_version: number;
  settings: L4Settings;
  updated_at: string;
  updated_by: string | null;
};

export type L4Settings = {
  hub?: { default_route?: string };
  telemetry?: {
    grafana_ui_url?: string | null;
    trace_span_retention_days?: number;
    trace_sample_ratio?: number;
  };
  identity?: {
    lockout_threshold?: number;
    lockout_minutes?: number;
    password_min_length?: number;
    access_token_ttl_seconds?: number;
    refresh_token_ttl_seconds?: number;
  };
  governance?: {
    promotion_stage_order?: string[];
    promotion_approval_stages?: string[];
    skip_approval_for_promote?: boolean;
    promotion_allow_skip_stages?: boolean;
    rollback_enabled?: boolean;
    rollback_requires_approval?: boolean;
    replay_require_checksum?: boolean;
    replay_require_signed_manifest?: boolean;
    quota_defaults?: {
      max_projects?: number;
      max_datasets_per_project?: number;
      max_models_per_project?: number;
      max_runs_per_project?: number;
      max_webhook_subscriptions_per_project?: number;
      max_parallel_tasks?: number;
    };
    webhook_allowed_hosts?: string[];
  };
  runtime?: {
    dataset_artifact_root?: string;
    model_artifact_root?: string;
    task_execution_mode?: "internal" | "external";
    task_lease_seconds?: number;
    lease_reap_interval_seconds?: number;
    log_level?: string;
    resource_sample_interval?: number;
    resource_flush_interval?: number;
    replay_require_artifact_evidence?: boolean;
  };
  features?: Record<string, boolean>;
};

export type EnvCatalogItem = {
  key: string;
  section: string;
  value_type: string;
  layer: "l4" | "env" | "compose" | "secret";
  description: string;
  l4_path?: string | null;
  restart_required?: boolean;
  example_default?: string | null;
  editable: boolean;
  source: "l4" | "env" | "default";
  effective: string | null;
  set_in_process_env: boolean;
};

export type EnvCatalogDocument = {
  schema_version: number;
  sections: string[];
  items: EnvCatalogItem[];
  counts: { total: number; l4: number; env: number; compose: number; secret: number };
};

export const HUB_ROUTES = ["datasets", "lifecycle", "dashboard", "models"] as const;

export const FEATURE_FLAG_META: Array<{ key: string; label: string; group: string }> = [
  { key: "usage_tracking", label: "Usage tracking", group: "Observability" },
  { key: "resource_monitor", label: "Resource monitor", group: "Observability" },
  { key: "otel_enabled", label: "OpenTelemetry", group: "Observability" },
  { key: "event_outbox", label: "Semantic event outbox", group: "Observability" },
  { key: "domain_event_outbox", label: "Domain event outbox", group: "Observability" },
  { key: "event_stream", label: "Semantic event stream", group: "Observability" },
  { key: "event_stream_global_fanout", label: "Event stream global fan-out", group: "Observability" },
  { key: "execution_projection", label: "Execution projection", group: "Observability" },
  { key: "semantic_event_signing", label: "Semantic event signing", group: "Observability" },
  { key: "semantic_event_validate", label: "Semantic event validate", group: "Observability" },
  { key: "semantic_webhook_delivery", label: "Semantic webhook delivery", group: "Integrations" },
  { key: "semantic_webhook_dedupe", label: "Semantic webhook dedupe", group: "Integrations" },
  { key: "domain_webhook_delivery", label: "Domain webhook delivery", group: "Integrations" },
  { key: "domain_webhook_dedupe", label: "Domain webhook dedupe", group: "Integrations" },
  { key: "notification_delivery", label: "Notification delivery", group: "Integrations" },
  { key: "integration_delivery", label: "Integration delivery", group: "Integrations" },
  { key: "strict_dataset_version_required", label: "Strict dataset version required", group: "Lifecycle" },
  { key: "strict_dataset_version_all_post_runs", label: "Strict pin on all POST /runs", group: "Lifecycle" },
  { key: "readiness_allow_legacy_fallback", label: "Readiness legacy fallback", group: "Lifecycle" },
  { key: "warn_implicit_dataset_head", label: "Warn implicit dataset head", group: "Lifecycle" },
  { key: "lineage_legacy_default_version_label", label: "Legacy lineage version label", group: "Lifecycle" },
  { key: "readiness_async_queue", label: "Async readiness queue", group: "Lifecycle" },
  { key: "dataset_retention_policies", label: "Dataset retention policies", group: "Lifecycle" },
  { key: "require_declared_dataset_inputs", label: "Require declared dataset inputs", group: "Lifecycle" },
  { key: "validate_dataset_version_checksum", label: "Validate dataset version checksum", group: "Lifecycle" },
  { key: "skip_approval_for_promote", label: "Skip approval for promote", group: "Governance" },
  { key: "rollback_enabled", label: "Rollback enabled", group: "Governance" },
  { key: "rollback_requires_approval", label: "Rollback requires approval", group: "Governance" },
  { key: "promotion_allow_skip_stages", label: "Allow skip promotion stages", group: "Governance" },
  { key: "replay_require_checksum", label: "Replay require checksum", group: "Governance" },
  { key: "replay_require_signed_manifest", label: "Replay require signed manifest", group: "Governance" },
  { key: "manifest_strict_key_lifecycle", label: "Manifest strict key lifecycle", group: "Governance" },
  { key: "tenant_quota_enforce", label: "Enforce tenant quotas", group: "Governance" },
  { key: "dataset_hub_v2", label: "Dataset Hub v2", group: "Hub" },
  { key: "scope_debug_panel", label: "Scope debug panel", group: "Hub" },
  { key: "serving_slots_http", label: "Serving slots HTTP", group: "Hub" },
  { key: "http_pipeline_tasks", label: "HTTP pipeline tasks", group: "Hub" },
  { key: "http_task_templates", label: "HTTP task templates", group: "Hub" },
  { key: "validate_plugin_exists_on_create", label: "Validate plugin on create", group: "Plugins" },
  { key: "plugin_version_enforcement", label: "Plugin version enforcement", group: "Plugins" },
  { key: "legacy_static_tokens", label: "Legacy static tokens", group: "Auth" },
  { key: "projections_enabled", label: "Projection write path", group: "Read platform" },
  { key: "timeline_projection_reads", label: "Timeline projection reads", group: "Read platform" },
  { key: "dashboard_projection_reads", label: "Dashboard projection reads", group: "Read platform" },
  { key: "event_retention_enabled", label: "Event retention & purge", group: "Governance enterprise" },
  { key: "siem_export_enabled", label: "SIEM export", group: "Governance enterprise" },
  { key: "event_schema_registry_enabled", label: "Event schema registry", group: "Governance enterprise" },
  { key: "multi_cluster", label: "Multi-cluster registry", group: "Distributed" },
  { key: "multi_region", label: "Multi-region", group: "Distributed" },
  { key: "federation", label: "Federation", group: "Distributed" },
  { key: "edge_deployment", label: "Edge deployment", group: "Distributed" },
  { key: "global_scheduler", label: "Global scheduler", group: "Distributed" },
  { key: "cross_region_replication", label: "Cross-region replication", group: "Distributed" },
  { key: "disaster_recovery", label: "Disaster recovery", group: "Distributed" },
  { key: "global_identity", label: "Global identity trust", group: "Distributed" },
  { key: "global_observability", label: "Global observability", group: "Distributed" },
  { key: "extension_platform", label: "Extension platform", group: "Distributed" },
];

/** Newer flags default off in Hub until explicitly enabled in L4 or .env. */
export const FEATURE_DEFAULT_OFF = new Set([
  "projections_enabled",
  "timeline_projection_reads",
  "dashboard_projection_reads",
  "notification_delivery",
  "integration_delivery",
  "event_retention_enabled",
  "siem_export_enabled",
  "event_schema_registry_enabled",
  "multi_cluster",
  "multi_region",
  "federation",
  "edge_deployment",
  "global_scheduler",
  "cross_region_replication",
  "disaster_recovery",
  "global_identity",
  "global_observability",
  "extension_platform",
]);

export function featureDefaultEnabled(key: string): boolean {
  return !FEATURE_DEFAULT_OFF.has(key);
}

function systemSettingsPath(suffix = ""): string {
  const base = getApiBaseUrl();
  const path = `/v1/system/settings${suffix}`;
  if (!base) return path;
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/system/settings${suffix}`;
  return `${trimmed}${path}`;
}

export async function fetchSystemSettings(token: string): Promise<SystemSettingsDocument> {
  const res = await fetch(systemSettingsPath(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `system settings HTTP ${res.status}`);
  }
  return res.json() as Promise<SystemSettingsDocument>;
}

export async function fetchSystemSettingsCatalog(token: string): Promise<EnvCatalogDocument> {
  const res = await fetch(systemSettingsPath("/catalog"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `system settings catalog HTTP ${res.status}`);
  }
  return res.json() as Promise<EnvCatalogDocument>;
}

export async function patchSystemSettings(
  token: string,
  partial: Record<string, unknown>,
): Promise<SystemSettingsDocument> {
  const res = await fetch(systemSettingsPath(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `system settings patch HTTP ${res.status}`);
  }
  return res.json() as Promise<SystemSettingsDocument>;
}
