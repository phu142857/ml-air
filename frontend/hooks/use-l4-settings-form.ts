"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSystemSettings,
  patchSystemSettings,
  type L4Settings,
  type SystemSettingsDocument,
} from "@/lib/system-settings-api";
import { toastError, toastSuccess } from "@/lib/toast-actions";

function parseIntOr(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function hostsToString(hosts: string[] | undefined): string {
  return (hosts || []).join(", ");
}

export function hostsFromString(raw: string): string[] {
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export type L4FormState = {
  hubRoute: string;
  lockoutThreshold: string;
  lockoutMinutes: string;
  skipApproval: boolean;
  allowSkipStages: boolean;
  tenantQuotaEnforce: boolean;
  promotionOrder: string;
  quotaProjects: string;
  quotaDatasets: string;
  quotaModels: string;
  quotaRuns: string;
  quotaWebhooks: string;
  platformWebhookHosts: string;
  grafanaUrl: string;
  traceRetentionDays: string;
  traceSampleRatio: string;
};

export function stateFromL4(s: L4Settings): L4FormState {
  return {
    hubRoute: s.hub?.default_route || "datasets",
    lockoutThreshold: String(s.identity?.lockout_threshold ?? 5),
    lockoutMinutes: String(s.identity?.lockout_minutes ?? 15),
    skipApproval: Boolean(s.governance?.skip_approval_for_promote ?? true),
    allowSkipStages: Boolean(s.governance?.promotion_allow_skip_stages ?? true),
    tenantQuotaEnforce: Boolean(s.features?.tenant_quota_enforce ?? true),
    promotionOrder: (s.governance?.promotion_stage_order || ["staging", "production"]).join(","),
    quotaProjects: String(s.governance?.quota_defaults?.max_projects ?? 200),
    quotaDatasets: String(s.governance?.quota_defaults?.max_datasets_per_project ?? 500),
    quotaModels: String(s.governance?.quota_defaults?.max_models_per_project ?? 200),
    quotaRuns: String(s.governance?.quota_defaults?.max_runs_per_project ?? 50000),
    quotaWebhooks: String(s.governance?.quota_defaults?.max_webhook_subscriptions_per_project ?? 50),
    platformWebhookHosts: hostsToString(s.governance?.webhook_allowed_hosts),
    grafanaUrl: String(s.telemetry?.grafana_ui_url || ""),
    traceRetentionDays: String(s.telemetry?.trace_span_retention_days ?? 30),
    traceSampleRatio: String(s.telemetry?.trace_sample_ratio ?? 1),
  };
}

export function partialFromForm(form: L4FormState, keys: Array<keyof L4Settings | "features">): Partial<L4Settings> {
  const partial: Partial<L4Settings> = {};
  if (keys.includes("hub")) {
    partial.hub = { default_route: form.hubRoute };
  }
  if (keys.includes("identity")) {
    partial.identity = {
      lockout_threshold: parseIntOr(form.lockoutThreshold, 5),
      lockout_minutes: parseIntOr(form.lockoutMinutes, 15),
    };
  }
  if (keys.includes("governance")) {
    partial.governance = {
      skip_approval_for_promote: form.skipApproval,
      promotion_allow_skip_stages: form.allowSkipStages,
      promotion_stage_order: form.promotionOrder
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      quota_defaults: {
        max_projects: parseIntOr(form.quotaProjects, 200),
        max_datasets_per_project: parseIntOr(form.quotaDatasets, 500),
        max_models_per_project: parseIntOr(form.quotaModels, 200),
        max_runs_per_project: parseIntOr(form.quotaRuns, 50000),
        max_webhook_subscriptions_per_project: parseIntOr(form.quotaWebhooks, 50),
      },
      webhook_allowed_hosts: hostsFromString(form.platformWebhookHosts),
    };
  }
  if (keys.includes("telemetry")) {
    partial.telemetry = {
      grafana_ui_url: form.grafanaUrl.trim() || null,
      trace_span_retention_days: parseIntOr(form.traceRetentionDays, 30),
      trace_sample_ratio: Number.parseFloat(form.traceSampleRatio) || 1,
    };
  }
  if (keys.includes("features")) {
    partial.features = { tenant_quota_enforce: form.tenantQuotaEnforce };
  }
  return partial;
}

export function useL4SettingsForm(token: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => fetchSystemSettings(token),
    enabled: Boolean(token.trim()),
  });
  const [form, setForm] = useState<L4FormState | null>(null);

  useEffect(() => {
    if (query.data?.settings) {
      setForm(stateFromL4(query.data.settings));
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<L4Settings>) => patchSystemSettings(token, partial as Record<string, unknown>),
    onSuccess: async () => {
      toastSuccess("Platform settings saved");
      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: unknown) => toastError("Save failed", String((e as Error)?.message || e)),
  });

  return { query, form, setForm, saveMutation, doc: query.data as SystemSettingsDocument | undefined };
}
