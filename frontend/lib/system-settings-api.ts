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
  };
  governance?: {
    promotion_stage_order?: string[];
    skip_approval_for_promote?: boolean;
    promotion_allow_skip_stages?: boolean;
    rollback_enabled?: boolean;
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
  features?: Record<string, boolean>;
};

export const HUB_ROUTES = ["datasets", "lifecycle", "dashboard", "models"] as const;

export async function fetchSystemSettings(token: string): Promise<SystemSettingsDocument> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/system/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `system settings HTTP ${res.status}`);
  }
  return res.json() as Promise<SystemSettingsDocument>;
}

export async function patchSystemSettings(
  token: string,
  partial: Record<string, unknown>,
): Promise<SystemSettingsDocument> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/system/settings`, {
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
