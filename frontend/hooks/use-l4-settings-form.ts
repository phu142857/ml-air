"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEATURE_FLAG_META,
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

function parseFloatOr(value: string, fallback: number): number {
  const n = Number.parseFloat(value);
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
  passwordMinLength: string;
  accessTokenTtlSeconds: string;
  refreshTokenTtlSeconds: string;
  skipApproval: boolean;
  allowSkipStages: boolean;
  rollbackEnabled: boolean;
  rollbackRequiresApproval: boolean;
  replayRequireChecksum: boolean;
  replayRequireSignedManifest: boolean;
  tenantQuotaEnforce: boolean;
  promotionOrder: string;
  promotionApprovalStages: string;
  quotaProjects: string;
  quotaDatasets: string;
  quotaModels: string;
  quotaRuns: string;
  quotaWebhooks: string;
  quotaParallelTasks: string;
  platformWebhookHosts: string;
  grafanaUrl: string;
  traceRetentionDays: string;
  traceSampleRatio: string;
  datasetArtifactRoot: string;
  modelArtifactRoot: string;
  taskExecutionMode: "internal" | "external";
  taskLeaseSeconds: string;
  leaseReapIntervalSeconds: string;
  logLevel: string;
  resourceSampleInterval: string;
  resourceFlushInterval: string;
  replayRequireArtifactEvidence: boolean;
  features: Record<string, boolean>;
};

export function stateFromL4(s: L4Settings): L4FormState {
  const features: Record<string, boolean> = {};
  for (const meta of FEATURE_FLAG_META) {
    features[meta.key] = Boolean(s.features?.[meta.key] ?? true);
  }
  if (s.features) {
    for (const [k, v] of Object.entries(s.features)) {
      features[k] = Boolean(v);
    }
  }
  return {
    hubRoute: s.hub?.default_route || "datasets",
    lockoutThreshold: String(s.identity?.lockout_threshold ?? 5),
    lockoutMinutes: String(s.identity?.lockout_minutes ?? 15),
    passwordMinLength: String(s.identity?.password_min_length ?? 8),
    accessTokenTtlSeconds: String(s.identity?.access_token_ttl_seconds ?? 900),
    refreshTokenTtlSeconds: String(s.identity?.refresh_token_ttl_seconds ?? 604800),
    skipApproval: Boolean(s.governance?.skip_approval_for_promote ?? true),
    allowSkipStages: Boolean(s.governance?.promotion_allow_skip_stages ?? true),
    rollbackEnabled: Boolean(s.governance?.rollback_enabled ?? true),
    rollbackRequiresApproval: Boolean(s.governance?.rollback_requires_approval ?? true),
    replayRequireChecksum: Boolean(s.governance?.replay_require_checksum ?? true),
    replayRequireSignedManifest: Boolean(s.governance?.replay_require_signed_manifest ?? true),
    tenantQuotaEnforce: Boolean(s.features?.tenant_quota_enforce ?? true),
    promotionOrder: (s.governance?.promotion_stage_order || ["staging", "production"]).join(","),
    promotionApprovalStages: (s.governance?.promotion_approval_stages || ["production"]).join(","),
    quotaProjects: String(s.governance?.quota_defaults?.max_projects ?? 200),
    quotaDatasets: String(s.governance?.quota_defaults?.max_datasets_per_project ?? 500),
    quotaModels: String(s.governance?.quota_defaults?.max_models_per_project ?? 200),
    quotaRuns: String(s.governance?.quota_defaults?.max_runs_per_project ?? 50000),
    quotaWebhooks: String(s.governance?.quota_defaults?.max_webhook_subscriptions_per_project ?? 50),
    quotaParallelTasks: String(s.governance?.quota_defaults?.max_parallel_tasks ?? 1000),
    platformWebhookHosts: hostsToString(s.governance?.webhook_allowed_hosts),
    grafanaUrl: String(s.telemetry?.grafana_ui_url || ""),
    traceRetentionDays: String(s.telemetry?.trace_span_retention_days ?? 30),
    traceSampleRatio: String(s.telemetry?.trace_sample_ratio ?? 1),
    datasetArtifactRoot: String(s.runtime?.dataset_artifact_root || "file:///mlair/artifacts/datasets"),
    modelArtifactRoot: String(s.runtime?.model_artifact_root || "file:///mlair/artifacts/models"),
    taskExecutionMode: s.runtime?.task_execution_mode === "internal" ? "internal" : "external",
    taskLeaseSeconds: String(s.runtime?.task_lease_seconds ?? 300),
    leaseReapIntervalSeconds: String(s.runtime?.lease_reap_interval_seconds ?? 5),
    logLevel: String(s.runtime?.log_level || "INFO"),
    resourceSampleInterval: String(s.runtime?.resource_sample_interval ?? 1),
    resourceFlushInterval: String(s.runtime?.resource_flush_interval ?? 1),
    replayRequireArtifactEvidence: Boolean(s.runtime?.replay_require_artifact_evidence ?? true),
    features,
  };
}

export function partialFromForm(
  form: L4FormState,
  keys: Array<keyof L4Settings | "features">,
): Partial<L4Settings> {
  const partial: Partial<L4Settings> = {};
  if (keys.includes("hub")) {
    partial.hub = { default_route: form.hubRoute };
  }
  if (keys.includes("identity")) {
    partial.identity = {
      lockout_threshold: parseIntOr(form.lockoutThreshold, 5),
      lockout_minutes: parseIntOr(form.lockoutMinutes, 15),
      password_min_length: parseIntOr(form.passwordMinLength, 8),
      access_token_ttl_seconds: parseIntOr(form.accessTokenTtlSeconds, 900),
      refresh_token_ttl_seconds: parseIntOr(form.refreshTokenTtlSeconds, 604800),
    };
  }
  if (keys.includes("governance")) {
    partial.governance = {
      skip_approval_for_promote: form.skipApproval,
      promotion_allow_skip_stages: form.allowSkipStages,
      rollback_enabled: form.rollbackEnabled,
      rollback_requires_approval: form.rollbackRequiresApproval,
      replay_require_checksum: form.replayRequireChecksum,
      replay_require_signed_manifest: form.replayRequireSignedManifest,
      promotion_stage_order: form.promotionOrder
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      promotion_approval_stages: form.promotionApprovalStages
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      quota_defaults: {
        max_projects: parseIntOr(form.quotaProjects, 200),
        max_datasets_per_project: parseIntOr(form.quotaDatasets, 500),
        max_models_per_project: parseIntOr(form.quotaModels, 200),
        max_runs_per_project: parseIntOr(form.quotaRuns, 50000),
        max_webhook_subscriptions_per_project: parseIntOr(form.quotaWebhooks, 50),
        max_parallel_tasks: parseIntOr(form.quotaParallelTasks, 1000),
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
  if (keys.includes("runtime")) {
    partial.runtime = {
      dataset_artifact_root: form.datasetArtifactRoot.trim(),
      model_artifact_root: form.modelArtifactRoot.trim(),
      task_execution_mode: form.taskExecutionMode,
      task_lease_seconds: parseIntOr(form.taskLeaseSeconds, 300),
      lease_reap_interval_seconds: parseIntOr(form.leaseReapIntervalSeconds, 5),
      log_level: form.logLevel.trim().toUpperCase() || "INFO",
      resource_sample_interval: parseFloatOr(form.resourceSampleInterval, 1),
      resource_flush_interval: parseFloatOr(form.resourceFlushInterval, 1),
      replay_require_artifact_evidence: form.replayRequireArtifactEvidence,
    };
  }
  if (keys.includes("features")) {
    partial.features = {
      ...form.features,
      tenant_quota_enforce: form.tenantQuotaEnforce,
      skip_approval_for_promote: form.skipApproval,
      promotion_allow_skip_stages: form.allowSkipStages,
      rollback_enabled: form.rollbackEnabled,
      rollback_requires_approval: form.rollbackRequiresApproval,
      replay_require_checksum: form.replayRequireChecksum,
      replay_require_signed_manifest: form.replayRequireSignedManifest,
    };
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
      await queryClient.invalidateQueries({ queryKey: ["system-settings-catalog"] });
    },
    onError: (e: unknown) => toastError("Save failed", String((e as Error)?.message || e)),
  });

  return { query, form, setForm, saveMutation, doc: query.data as SystemSettingsDocument | undefined };
}
