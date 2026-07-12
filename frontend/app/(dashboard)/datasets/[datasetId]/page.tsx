"use client";

import { ChevronRight, Copy, Database, Download, Eye, GitBranch, Loader2, Play, Plus, Tags, Trash2, X } from "lucide-react";
import {
  DetailSection,
  DetailTabBar,
  FilterChips,
  MetadataGrid,
  MlopsEmptyState,
  PageScrollBody,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
} from "@/components/mlops/layout";
import { DetailTabSkeleton } from "@/components/mlops/detail-tab-skeleton";
import { useTabLoading } from "@/hooks/use-tab-loading";
import { Badge } from "@/components/ui/badge";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DatasetVersionDiffPanel } from "@/components/mlops/dataset-version-diff-panel";
import { DatasetVersionProvenancePanel } from "@/components/mlops/dataset-version-provenance-panel";
import { ExecutionIntentPanel } from "@/components/mlops/execution-intent-panel";
import {
  DatasetVersionScrollEditor,
  type DatasetVersionScrollEditorHandle,
} from "@/components/mlops/dataset-version-scroll-editor";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { useDatasetReadinessEvaluations } from "@/hooks/use-dataset-readiness-evaluations";
import { useDatasetRuns } from "@/hooks/use-dataset-runs";
import {
  fetchDataset,
  fetchDatasetBuffer,
  fetchDatasetReadiness,
  postDatasetReadinessEvaluate,
  fetchDatasetTrainingPolicies,
  fetchDatasetTrainingEligibility,
  fetchDatasetVersions,
  fetchDatasetRetentionPolicy,
  upsertDatasetRetentionPolicy,
  previewDatasetRetention,
  applyDatasetRetention,
  deleteDataset,
  deleteDatasetVersion,
  downloadDatasetVersion,
  materializeDatasetBuffer,
  materializeScheduledDatasetBuffers,
  patchDatasetBuffer,
  patchDatasetVersionMetadata,
  fetchRuntimeConfig,
  type DatasetVersionItem,
  type RunItem,
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { StatusBadge } from "@/components/mlops/status-badge";
import { datasetSourceTypeBadge, datasetVersionSourceBadge } from "@/lib/dataset-source-type";
import {
  datasetStatusBadgeClass,
  feedbackMessageClass,
  normalizeDatasetStatus,
  normalizeStatus,
  readinessStatusChipClass,
  STATUS_CALLOUT_CLASS,
  STATUS_CHIP_CLASS,
  STATUS_CHIP_TEXT,
  statusToMlopsBadge,
} from "@/lib/status-style";
import { describeTrainError } from "@/lib/describe-train-error";
import {
  DatasetTrainingPolicyPanel,
  PolicyConfigSummary,
} from "@/components/readiness/dataset-training-policy-panel";
import { useAppContext } from "@/lib/app-context";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_DATASET_DETAIL } from "@/lib/scope-messages";
import { cn, formatApiClientError, formatDateTimeCompact, formatRelativeTime } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";
import { copyWithToast, toastError, toastSuccess } from "@/lib/toast-actions";

/** Single accent for all dataset hub sections (matches list page + header). */
const DATASET_SECTION_ACCENT = "emerald" as const;

const DATASET_TABS = [
  { id: "overview", label: "Overview" },
  { id: "versions", label: "Versions" },
  { id: "readiness", label: "Readiness" },
  { id: "accumulation", label: "Accumulation" },
  { id: "training", label: "Run / Train" },
] as const;

function accumulationFeedbackClass(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("saved") || m.includes("materialized") || m.includes("schedule tick")) {
    return feedbackMessageClass("success");
  }
  return feedbackMessageClass("failed");
}

function formatEvaluationReasons(reasons: Array<string | Record<string, unknown>> | undefined): string {
  if (!reasons?.length) return "";
  return reasons
    .map((r) => {
      if (typeof r === "string") return r;
      const o = r as Record<string, unknown>;
      if (typeof o.message === "string") return String(o.message);
      if (typeof o.code === "string" && typeof o.message === "string") return `${o.code}: ${o.message}`;
      if (typeof o.code === "string") return String(o.code);
      try {
        return JSON.stringify(o);
      } catch {
        return "reason";
      }
    })
    .join(" · ");
}

const ACCUMULATION_STRATEGY_OPTIONS = [
  { value: "snapshot_on_threshold", label: "snapshot_on_threshold" },
  { value: "rolling_accumulate", label: "rolling_accumulate" },
  { value: "snapshot_on_schedule", label: "snapshot_on_schedule" },
  { value: "manual_materialize_only", label: "manual_materialize_only" }
];

const READINESS_EVAL_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "status: all" },
  { value: "eligible", label: "status: eligible" },
  { value: "blocked", label: "status: blocked" }
];

const READINESS_EVAL_SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "source: all" },
  { value: "manual", label: "source: manual" },
  { value: "scheduler", label: "source: scheduler" },
  { value: "pre_training", label: "source: pre_training" },
  { value: "auto_policy", label: "source: auto_policy" }
];


type ReadinessEvaluationRow = import("@/lib/api").DatasetReadinessEvaluationItem;

export default function DatasetHubPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = decodeURIComponent(params.datasetId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token, accessibleScopes } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "versions" | "readiness" | "accumulation" | "training">("overview");
  const isTabLoading = useTabLoading(activeTab);

  const DATASET_TAB_SKELETON: Record<string, "grid" | "table"> = {
    overview: "grid",
    versions: "table",
    readiness: "table",
    accumulation: "grid",
    training: "grid",
  };
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [evaluationStatusFilter, setEvaluationStatusFilter] = useState("all");
  /** When false, `POST .../runs/trigger` can omit `dataset_version_id` server-side (compat); Hub still pins per-row Train. */
  const [strictDatasetVersionOnTrigger, setStrictDatasetVersionOnTrigger] = useState(true);
  /** When true, API requires `dataset_version_id` on `POST .../runs`, gated pipeline run, and check-readiness without declared inputs. */
  const [strictDatasetVersionAllPostRuns, setStrictDatasetVersionAllPostRuns] = useState(false);
  /** When true, API allows implicit latest-head on dataset readiness when `dataset_version_id` is omitted (compat). */
  const [readinessLegacyFallback, setReadinessLegacyFallback] = useState(false);
  const [evaluationPolicyFilter, setEvaluationPolicyFilter] = useState("all");
  const [evaluationSourceFilter, setEvaluationSourceFilter] = useState("all");
  const [accumulationThresholdDraft, setAccumulationThresholdDraft] = useState("");
  const [accumulationStrategyDraft, setAccumulationStrategyDraft] = useState("snapshot_on_threshold");
  const [accumulationMsg, setAccumulationMsg] = useState("");
  const [scheduleTickLimit, setScheduleTickLimit] = useState("50");
  const [scheduleTickResult, setScheduleTickResult] = useState<{
    checked: number;
    materialized_count: number;
    materialized: Array<{ dataset_id: string; dataset_version_id: string; version: string; strategy: string }>;
    skipped: Array<Record<string, unknown>>;
  } | null>(null);
  const [versionMetaOpen, setVersionMetaOpen] = useState(false);
  const [versionMetaId, setVersionMetaId] = useState("");
  const [versionMetaLabel, setVersionMetaLabel] = useState("");
  const [versionMetaTagInput, setVersionMetaTagInput] = useState("");
  const [versionMetaRefUrl, setVersionMetaRefUrl] = useState("");
  const [versionMetaRefLabel, setVersionMetaRefLabel] = useState("");
  const [versionMetaMsg, setVersionMetaMsg] = useState("");
  const [versionEditorOpen, setVersionEditorOpen] = useState(false);
  const [versionEditorId, setVersionEditorId] = useState("");
  const [versionEditorLabel, setVersionEditorLabel] = useState("");
  const [versionEditorMsg, setVersionEditorMsg] = useState("");
  const [versionEditorDirty, setVersionEditorDirty] = useState(false);
  const [versionEditorSaving, setVersionEditorSaving] = useState(false);
  const [versionEditorDiscardOpen, setVersionEditorDiscardOpen] = useState(false);
  const versionEditorRef = useRef<DatasetVersionScrollEditorHandle>(null);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionMaxVersions, setRetentionMaxVersions] = useState("50");
  const [deleteDatasetOpen, setDeleteDatasetOpen] = useState(false);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState("");
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState("");
  const [retentionMaxAgeDays, setRetentionMaxAgeDays] = useState("");
  const [retentionProtectReferenced, setRetentionProtectReferenced] = useState(true);
  const [retentionMsg, setRetentionMsg] = useState("");
  const [retentionPreview, setRetentionPreview] = useState<{
    eligible_count: number;
    candidates: Array<{ version_id: string; version?: string | null; reasons: string[] }>;
  } | null>(null);

  const poll = useRealtimeQueryPolling();

  const datasetQuery = useQuery({
    queryKey: mlairKeys.datasets.detail(tenantId, projectId, datasetId),
    queryFn: () => fetchDataset(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token),
    refetchOnMount: "always",
    ...poll,
  });
  const dataset = datasetQuery.data ?? null;

  const versionsQuery = useQuery({
    queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetVersions(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token),
    refetchOnMount: "always",
    ...poll,
  });

  const retentionPolicyQuery = useQuery({
    queryKey: mlairKeys.datasets.retentionPolicy(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetRetentionPolicy(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token && !scopePinned),
    refetchOnMount: "always",
    ...poll,
  });

  useEffect(() => {
    const p = retentionPolicyQuery.data;
    if (!p) return;
    setRetentionEnabled(Boolean(p.enabled));
    setRetentionMaxVersions(String(p.max_versions ?? 50));
    setRetentionMaxAgeDays(p.max_age_days != null ? String(p.max_age_days) : "");
    setRetentionProtectReferenced(p.protect_referenced !== false);
  }, [retentionPolicyQuery.data]);

  const retentionSaveMutation = useMutation({
    mutationFn: () =>
      upsertDatasetRetentionPolicy(tenantId, projectId, datasetId, token, {
        enabled: retentionEnabled,
        max_versions: Math.max(1, Number.parseInt(retentionMaxVersions || "50", 10) || 50),
        max_age_days: retentionMaxAgeDays.trim()
          ? Math.max(1, Number.parseInt(retentionMaxAgeDays, 10) || 1)
          : null,
        protect_referenced: retentionProtectReferenced
      }),
    onSuccess: async () => {
      setRetentionMsg("");
      toastSuccess("Retention policy saved");
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.retentionPolicy(tenantId, projectId, datasetId)
      });
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message || e);
      setRetentionMsg(msg);
      toastError("Save failed", msg);
    }
  });

  const retentionPreviewMutation = useMutation({
    mutationFn: async () => {
      await retentionSaveMutation.mutateAsync();
      return previewDatasetRetention(tenantId, projectId, datasetId, token);
    },
    onSuccess: (data) => {
      setRetentionPreview({ eligible_count: data.eligible_count, candidates: data.candidates || [] });
      const msg = data.eligible_count
        ? `Preview: ${data.eligible_count} version(s) eligible for purge`
        : "Preview: nothing to purge";
      setRetentionMsg(msg);
      toastSuccess("Retention preview ready", msg);
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message || e);
      setRetentionMsg(msg);
      toastError("Preview failed", msg);
    }
  });

  const retentionApplyMutation = useMutation({
    mutationFn: () => applyDatasetRetention(tenantId, projectId, datasetId, token, false),
    onSuccess: async (data) => {
      const count = (data.deleted || []).length;
      const msg = `Deleted ${count} version(s)`;
      setRetentionMsg(msg);
      toastSuccess("Retention applied", msg);
      setRetentionPreview(null);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) });
    },
    onError: (e: unknown) => {
      const msg = String((e as Error)?.message || e);
      setRetentionMsg(msg);
      toastError("Apply failed", msg);
    }
  });

  useEffect(() => {
    setSelectedVersionId("");
  }, [datasetId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rc = await fetchRuntimeConfig({ preferRelative: true });
        if (cancelled) return;
        setStrictDatasetVersionOnTrigger(rc.features?.strict_dataset_version_required !== false);
        setStrictDatasetVersionAllPostRuns(rc.features?.strict_dataset_version_all_post_runs === true);
        setReadinessLegacyFallback(rc.features?.readiness_allow_legacy_fallback === true);
      } catch {
        if (!cancelled) {
          setStrictDatasetVersionOnTrigger(true);
          setReadinessLegacyFallback(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const items = versionsQuery.data?.items || [];
    if (!items.length) {
      if (selectedVersionId) setSelectedVersionId("");
      return;
    }
    if (!selectedVersionId || !items.some((v) => v.version_id === selectedVersionId)) {
      setSelectedVersionId(String(items[0].version_id || ""));
    }
  }, [versionsQuery.data?.items, selectedVersionId]);

  const selectedVersionForReadiness = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    if (!items.length) return undefined;
    if (selectedVersionId) {
      const matched = items.find((v) => v.version_id === selectedVersionId);
      if (matched) return matched.version_id;
    }
    return items[0]?.version_id;
  }, [versionsQuery.data, selectedVersionId]);
  const selectedVersionRecordCount = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    const picked = items.find((v) => v.version_id === selectedVersionForReadiness);
    return Number(picked?.record_count || 0);
  }, [versionsQuery.data, selectedVersionForReadiness]);

  const readinessQuery = useQuery({
    queryKey: [
      ...mlairKeys.datasets.readiness(tenantId, projectId, datasetId, 0),
      selectedVersionForReadiness || "latest",
      selectedPolicyId || "default-policy"
    ],
    queryFn: () =>
      fetchDatasetReadiness(tenantId, projectId, datasetId, token, 1000, selectedVersionForReadiness, selectedPolicyId || undefined),
    enabled: Boolean(datasetId && token && dataset && selectedPolicyId && selectedVersionForReadiness),
    refetchOnMount: "always",
    ...poll,
  });
  const bufferQuery = useQuery({
    queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetBuffer(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token && dataset),
    refetchOnMount: "always",
    ...poll,
  });

  useEffect(() => {
    const t = bufferQuery.data?.target_threshold;
    if (t != null && Number.isFinite(Number(t))) {
      setAccumulationThresholdDraft(String(t));
    }
    const s = String(bufferQuery.data?.accumulation_strategy || "snapshot_on_threshold").trim();
    setAccumulationStrategyDraft(
      s === "rolling_accumulate" || s === "snapshot_on_schedule" || s === "manual_materialize_only"
        ? s
        : "snapshot_on_threshold"
    );
  }, [bufferQuery.data?.target_threshold, bufferQuery.data?.accumulation_strategy, datasetId]);

  const patchBufferMutation = useMutation({
    mutationFn: async () => {
      const n = Number.parseInt(accumulationThresholdDraft, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(JSON.stringify({ detail: "target_threshold must be >= 1" }));
      return patchDatasetBuffer(tenantId, projectId, datasetId, token, {
        target_threshold: n,
        accumulation_strategy: accumulationStrategyDraft
      });
    },
    onSuccess: async () => {
      setAccumulationMsg("");
      toastSuccess("Materialization target saved");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) });
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId),
        exact: false
      });
    },
    onError: (err: unknown) => {
      const msg = describeTrainError(err);
      setAccumulationMsg(msg);
      toastError("Save failed", msg);
    }
  });
  const materializeBufferMutation = useMutation({
    mutationFn: async () => materializeDatasetBuffer(tenantId, projectId, datasetId, token),
    onSuccess: async (out) => {
      const msg = `Materialized ${out.version} (${out.dataset_version_id.slice(0, 8)}…).`;
      setAccumulationMsg(msg);
      toastSuccess("Buffer materialized", msg);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId),
          exact: false
        })
      ]);
    },
    onError: (err: unknown) => {
      const msg = describeTrainError(err);
      setAccumulationMsg(msg);
      toastError("Materialize failed", msg);
    }
  });
  const materializeScheduledMutation = useMutation({
    mutationFn: async () =>
      materializeScheduledDatasetBuffers(tenantId, projectId, token, Number.parseInt(scheduleTickLimit, 10) || 50),
    onSuccess: async (out) => {
      setScheduleTickResult(out);
      const msg = `Schedule tick checked=${out.checked}, materialized=${out.materialized_count}.`;
      setAccumulationMsg(msg);
      toastSuccess("Schedule tick complete", msg);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId) }),
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId),
          exact: false
        })
      ]);
    },
    onError: (err: unknown) => {
      const msg = describeTrainError(err);
      setAccumulationMsg(msg);
      toastError("Schedule tick failed", msg);
    }
  });
  const readinessEvaluationFilters = useMemo(
    () => ({
      status: evaluationStatusFilter,
      policyId: evaluationPolicyFilter,
      source: evaluationSourceFilter,
    }),
    [evaluationStatusFilter, evaluationPolicyFilter, evaluationSourceFilter]
  );
  const readinessEvaluationsQuery = useDatasetReadinessEvaluations(
    datasetId,
    Boolean(datasetId && token && dataset),
    readinessEvaluationFilters
  );
  const datasetRunsQuery = useDatasetRuns(datasetId, Boolean(datasetId && token && dataset));
  const [evaluatePersistMsg, setEvaluatePersistMsg] = useState<string | null>(null);
  const evaluatePersistMutation = useMutation({
    mutationFn: async () => {
      if (!token || !selectedPolicyId) throw new Error("missing_policy");
      if (!selectedVersionForReadiness) throw new Error("missing_dataset_version");
      return postDatasetReadinessEvaluate(tenantId, projectId, datasetId, token, {
        requiredSize: 1000,
        datasetVersionId: selectedVersionForReadiness,
        policyId: selectedPolicyId,
        source: "manual"
      });
    },
    onSuccess: async (out) => {
      const msg = `Recorded evaluation ${String(out.evaluation_id || "").slice(0, 8)}…`;
      setEvaluatePersistMsg(msg);
      toastSuccess("Evaluation recorded", msg);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId),
          exact: false
        }),
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.readiness(tenantId, projectId, datasetId, 0),
          exact: false
        })
      ]);
    },
    onError: (err: unknown) => {
      const msg = describeTrainError(err);
      setEvaluatePersistMsg(msg);
      toastError("Evaluation failed", msg);
    }
  });
  const patchVersionMetadataMutation = useMutation({
    mutationFn: async () => {
      const append_tags = versionMetaTagInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const url = versionMetaRefUrl.trim();
      const append_external_refs =
        url.length > 0
          ? [{ url, ...(versionMetaRefLabel.trim() ? { label: versionMetaRefLabel.trim() } : {}) }]
          : [];
      if (!append_tags.length && !append_external_refs.length) {
        throw new Error(JSON.stringify({ detail: "metadata_patch_empty" }));
      }
      return patchDatasetVersionMetadata(tenantId, projectId, versionMetaId, token, {
        append_tags: append_tags.length ? append_tags : undefined,
        append_external_refs: append_external_refs.length ? append_external_refs : undefined
      });
    },
    onSuccess: async () => {
      setVersionMetaMsg("");
      toastSuccess("Version metadata updated");
      setVersionMetaTagInput("");
      setVersionMetaRefUrl("");
      setVersionMetaRefLabel("");
      setVersionMetaOpen(false);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) });
    },
    onError: (err: unknown) => {
      const msg = describeTrainError(err);
      setVersionMetaMsg(msg);
      toastError("Metadata update failed", msg);
    }
  });
  const policiesQuery = useQuery({
    queryKey: mlairKeys.datasets.trainingPolicies(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetTrainingPolicies(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token && dataset),
    refetchOnMount: "always",
    ...poll,
  });
  const evaluationPolicyFilterOptions = useMemo(() => {
    return [
      { value: "all", label: "policy: all" },
      ...(policiesQuery.data?.items || []).map((p) => ({
        value: String(p.policy_id),
        label: `policy: ${String(p.policy_id).slice(0, 8)}…`
      }))
    ];
  }, [policiesQuery.data?.items]);
  const eligibilityQuery = useQuery({
    queryKey: [
      ...mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId),
      selectedVersionForReadiness || "latest"
    ],
    queryFn: () =>
      fetchDatasetTrainingEligibility(tenantId, projectId, datasetId, token, {
        datasetVersionId: selectedVersionForReadiness || undefined
      }),
    enabled: Boolean(
      datasetId &&
        token &&
        dataset &&
        (policiesQuery.data?.items?.length ?? 0) > 0 &&
        selectedVersionForReadiness
    ),
    refetchOnMount: "always",
    ...poll,
  });

  const readinessVersionSelectOptions = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    if (!items.length) return [];
    const head = items[0];
    const older =
      items.length <= 1
        ? []
        : items.slice(1).map((v) => ({
            value: v.version_id,
            label: formatVersionLabel(v.version),
          }));
    return [
      { value: head.version_id, label: `Head snapshot (${formatVersionLabel(head.version)})` },
      ...older
    ];
  }, [versionsQuery.data?.items]);
  const trainingEligibilityRows = useMemo(() => {
    const policyById = new Map((policiesQuery.data?.items || []).map((p) => [p.policy_id, p]));
    const items = eligibilityQuery.data?.items ?? [];
    return items.map((it) => {
      const policy = policyById.get(it.policy_id);
      return {
        policyId: it.policy_id,
        triggerMode: it.trigger_mode,
        modelId: it.model_id ? String(it.model_id) : null,
        requiredSize: it.required_size,
        freshnessHours: policy?.freshness_hours ?? null,
        validationRulesCount: policy?.validation_rules?.length ?? 0,
        currentSize: it.current_size,
        eligible: it.eligible,
        reasons: (it.reasons || []).map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
      };
    });
  }, [eligibilityQuery.data, policiesQuery.data?.items]);

  const selectedPolicy = useMemo(
    () => (policiesQuery.data?.items || []).find((p) => p.policy_id === selectedPolicyId) ?? null,
    [policiesQuery.data?.items, selectedPolicyId]
  );

  const selectedVersionCreatedAt = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    const vid = selectedVersionForReadiness;
    if (!vid) return null;
    return items.find((v) => v.version_id === vid)?.created_at ?? null;
  }, [versionsQuery.data?.items, selectedVersionForReadiness]);

  const refetchPolicyReadiness = useCallback(async () => {
    await Promise.all([
      policiesQuery.refetch(),
      readinessQuery.refetch(),
      queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId),
        exact: false,
      }),
    ]);
  }, [datasetId, policiesQuery, projectId, queryClient, readinessQuery, tenantId]);

  const bufferMaterializationHints = useMemo(() => {
    const buf = bufferQuery.data;
    if (!buf) return null;
    const strat = String(buf.accumulation_strategy || "snapshot_on_threshold").trim();
    const cur = Math.max(0, Math.floor(Number(buf.current_size ?? buf.record_count ?? 0)));
    const tgt = Math.max(0, Math.floor(Number(buf.target_threshold ?? 0)));
    const rowsToThreshold = tgt > 0 ? Math.max(0, tgt - cur) : null;
    const lastVid = buf.last_materialized_version_id ? String(buf.last_materialized_version_id) : "";
    const lastAt = buf.last_materialized_at ? formatDateTimeCompact(String(buf.last_materialized_at)) : "";
    const lastVersionLabel = (() => {
      if (!lastVid) return "";
      const v = (versionsQuery.data?.items || []).find((x) => x.version_id === lastVid);
      return v ? formatVersionLabel(v.version) : `${lastVid.slice(0, 8)}…`;
    })();
    return { strat, cur, tgt, rowsToThreshold, lastVid, lastAt, lastVersionLabel };
  }, [bufferQuery.data, versionsQuery.data?.items]);

  const evaluationItems = readinessEvaluationsQuery.items;

  const datasetRunColumns: DataTableColumn<RunItem>[] = useMemo(
    () => [
      {
        id: "run_id",
        header: "Run",
        width: 240,
        canHide: false,
        getSearchValue: (run) => run.run_id,
        getSortValue: (run) => run.run_id,
        cell: (run) => (
          <span className="font-mono text-sm text-primary">{run.run_id}</span>
        ),
      },
      {
        id: "pipeline",
        header: "Pipeline",
        width: 200,
        getSearchValue: (run) => run.pipeline_id || "",
        getSortValue: (run) => run.pipeline_id || "",
        getFilterValue: (run) => run.pipeline_id || null,
        cell: (run) => (
          <span className="font-mono text-xs text-muted-foreground">{run.pipeline_id || "—"}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        getSortValue: (run) => normalizeStatus(run.status),
        getFilterValue: (run) => normalizeStatus(run.status),
        filterOptions: [
          { label: "Pending", value: "PENDING" },
          { label: "Queued", value: "QUEUED" },
          { label: "Running", value: "RUNNING" },
          { label: "Success", value: "SUCCESS" },
          { label: "Failed", value: "FAILED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
        cell: (run) => (
          <StatusBadge status={statusToMlopsBadge(run.status)} label={run.status} size="sm" />
        ),
      },
      {
        id: "updated",
        header: "Updated",
        width: 140,
        getSortValue: (run) => run.updated_at,
        cell: (run) => (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(run.updated_at)}</span>
        ),
      },
    ],
    []
  );

  const evaluationColumns: DataTableColumn<ReadinessEvaluationRow>[] = useMemo(
    () => [
      {
        id: "status",
        header: "Status",
        width: 140,
        getSortValue: (row) => String(row.status || "blocked").toLowerCase(),
        getFilterValue: (row) => String(row.status || "blocked").toLowerCase(),
        filterOptions: [
          { label: "Eligible", value: "eligible" },
          { label: "Blocked", value: "blocked" },
          { label: "Ready", value: "ready" },
        ],
        cell: (row) => (
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase",
              readinessStatusChipClass(row.status),
            )}
          >
            {String(row.status || "blocked").toUpperCase()}
          </span>
        ),
      },
      {
        id: "sizes",
        header: "Current / Required",
        width: 160,
        getSortValue: (row) => Number(row.current_size || 0),
        getSearchValue: (row) => `${row.current_size ?? 0} ${row.required_size ?? 0}`,
        cell: (row) => (
          <span>
            {Number(row.current_size || 0)} / {Number(row.required_size || 0)}
          </span>
        ),
      },
      {
        id: "dataset_version",
        header: "Version",
        width: 180,
        getSearchValue: (row) => row.dataset_version_id || "",
        getSortValue: (row) => row.dataset_version_id || "",
        cell: (row) => (
          <span className="block max-w-[10rem] truncate font-mono text-xs text-muted-foreground" title={row.dataset_version_id || undefined}>
            {row.dataset_version_id || "—"}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        width: 120,
        getSearchValue: (row) => String(row.source || "manual"),
        getSortValue: (row) => String(row.source || "manual"),
        getFilterValue: (row) => String(row.source || "manual"),
        cell: (row) => (
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            {String(row.source || "manual")}
          </span>
        ),
      },
      {
        id: "why",
        header: "Why blocked",
        width: 220,
        wrap: true,
        getSearchValue: (row) => formatEvaluationReasons(row.reasons),
        cell: (row) => (
          <div className="text-xs text-muted-foreground" title={formatEvaluationReasons(row.reasons)}>
            {String(row.status || "").toLowerCase() === "eligible" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className={`line-clamp-2 ${STATUS_CHIP_TEXT.failed}`}>
                {formatEvaluationReasons(row.reasons) || "—"}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "evaluated",
        header: "Evaluated",
        width: 160,
        getSortValue: (row) => row.evaluated_at || "",
        cell: (row) => <span>{formatDateTimeCompact(row.evaluated_at)}</span>,
      },
    ],
    [],
  );

  useEffect(() => {
    const items = policiesQuery.data?.items ?? [];
    if (!items.length) return;
    setSelectedPolicyId((prev) => {
      const stillValid = Boolean(prev && items.some((p) => p.policy_id === prev));
      if (stillValid) return prev;
      return String(items[0]?.policy_id || "");
    });
  }, [policiesQuery.data, datasetId]);
  const canEditVersionMetadata = useMemo(() => {
    const role = accessibleScopes.find((s) => s.tenant_id === tenantId && s.project_id === projectId)?.role;
    const r = String(role || "").toLowerCase();
    return r === "maintainer" || r === "admin";
  }, [accessibleScopes, tenantId, projectId]);

  const closeVersionEditor = useCallback(() => {
    setVersionEditorOpen(false);
    setVersionEditorMsg("");
    setVersionEditorDirty(false);
    setVersionEditorDiscardOpen(false);
  }, []);

  const saveVersionEditorChanges = useCallback(async (): Promise<boolean> => {
    setVersionEditorSaving(true);
    setVersionEditorMsg("");
    const ok = (await versionEditorRef.current?.save()) ?? false;
    setVersionEditorSaving(false);
    if (ok) {
      toastSuccess("Version saved");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
        }),
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.detail(tenantId, projectId, datasetId),
        }),
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId),
        }),
        queryClient.invalidateQueries({
          queryKey: mlairKeys.datasets.readiness(tenantId, projectId, datasetId, 0),
        }),
      ]);
      setVersionEditorDirty(false);
    } else {
      setVersionEditorMsg("Save failed — check edits above.");
      toastError("Save failed", "Check edits above.");
    }
    return ok;
  }, [datasetId, projectId, queryClient, tenantId]);

  const requestVersionEditorClose = useCallback(() => {
    if (canEditVersionMetadata && versionEditorDirty) {
      setVersionEditorDiscardOpen(true);
      return;
    }
    closeVersionEditor();
  }, [canEditVersionMetadata, closeVersionEditor, versionEditorDirty]);

  const deleteDatasetMutation = useMutation({
    mutationFn: () => deleteDataset(tenantId, projectId, datasetId, token),
    onSuccess: async () => {
      setDeleteDatasetOpen(false);
      toastSuccess("Dataset deleted", datasetId);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId) });
      router.push("/datasets");
    },
    onError: (err) => {
      const msg = String((err as Error)?.message || err);
      setDeleteMsg(msg);
      toastError("Delete failed", msg);
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: string) =>
      deleteDatasetVersion(tenantId, projectId, datasetId, versionId, token),
    onSuccess: async () => {
      setDeleteVersionId(null);
      setDeleteMsg("");
      toastSuccess("Version deleted");
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
      });
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.detail(tenantId, projectId, datasetId) });
    },
    onError: (err) => {
      const msg = String((err as Error)?.message || err);
      setDeleteMsg(msg);
      toastError("Delete failed", msg);
    },
  });

  const versionColumns: DataTableColumn<DatasetVersionItem>[] = useMemo(() => {
    const cols: DataTableColumn<DatasetVersionItem>[] = [
      {
        id: "version",
        header: "Version",
        width: 120,
        canHide: false,
        getSearchValue: (v) => formatVersionLabel(v.version),
        getSortValue: (v) => v.version,
        cell: (v) => <span className="whitespace-nowrap font-mono text-xs">{formatVersionLabel(v.version)}</span>,
      },
      {
        id: "status",
        header: "Quality",
        width: 120,
        getSortValue: (v) => normalizeDatasetStatus(v.status),
        getFilterValue: (v) => normalizeDatasetStatus(v.status),
        filterOptions: [
          { label: "Ready", value: "READY" },
          { label: "Warning", value: "WARNING" },
          { label: "Failed", value: "FAILED" },
        ],
        cell: (v) => (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${datasetStatusBadgeClass(v.status)}`}
            title="Snapshot validation status — separate from Readiness eligibility"
          >
            {normalizeDatasetStatus(v.status)}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        width: 140,
        getSearchValue: (v) => datasetVersionSourceBadge(v).label,
        getSortValue: (v) => datasetVersionSourceBadge(v).label,
        getFilterValue: (v) => datasetVersionSourceBadge(v).label,
        cell: (v) => {
          const b = datasetVersionSourceBadge(v);
          return (
            <div className="flex flex-col gap-0.5">
              <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>
                {b.label}
              </span>
              {v.materialized_from_buffer ? (
                <button
                  type="button"
                  className="w-fit text-[10px] text-primary underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab("accumulation");
                  }}
                >
                  Buffer window →
                </button>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "rows",
        header: "Rows",
        width: 100,
        getSortValue: (v) => Number(v.record_count || 0),
        getSearchValue: (v) => String(v.record_count ?? 0),
        cell: (v) => <>{Number(v.record_count || 0)}</>,
      },
      {
        id: "checksum",
        header: "Checksum",
        width: 140,
        getSearchValue: (v) => String(v.checksum || ""),
        getSortValue: (v) => String(v.checksum || ""),
        cell: (v) => {
          const cs = String(v.checksum || "").trim();
          if (!cs) return <span className="text-[10px] text-muted-foreground">—</span>;
          return (
            <button
              type="button"
              className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[10px] text-muted-foreground hover:text-foreground"
              title={`Copy checksum: ${cs}`}
              onClick={(e) => {
                e.stopPropagation();
                void copyWithToast(cs, {
                  successTitle: "Checksum copied",
                  successDescription: `${cs.slice(0, 16)}…`,
                });
              }}
            >
              <Copy className="h-3 w-3 shrink-0" aria-hidden />
              {cs.slice(0, 10)}…
            </button>
          );
        },
      },
      {
        id: "tags",
        header: "Tags",
        width: 200,
        wrap: true,
        getSearchValue: (v) => (Array.isArray(v.tags) ? v.tags : []).join(" "),
        getSortValue: (v) => (Array.isArray(v.tags) ? v.tags : []).length,
        cell: (v) => (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(v.tags) ? v.tags : []).length ? (
              (Array.isArray(v.tags) ? v.tags : []).map((t) => (
                <span
                  key={`${v.version_id}:${t}`}
                  className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "refs",
        header: "Refs",
        width: 180,
        wrap: true,
        getSearchValue: (v) =>
          (Array.isArray(v.external_refs) ? v.external_refs : [])
            .map((r) => `${typeof r?.label === "string" ? r.label : ""} ${typeof r?.url === "string" ? r.url : ""}`)
            .join(" "),
        cell: (v) => (
          <div className="text-[10px] text-muted-foreground">
            {(Array.isArray(v.external_refs) ? v.external_refs : []).length ? (
              <ul className="list-inside list-disc space-y-0.5">
                {(Array.isArray(v.external_refs) ? v.external_refs : []).slice(0, 2).map((r, idx) => {
                  const url = typeof r?.url === "string" ? r.url : "";
                  const lab = typeof r?.label === "string" && r.label ? r.label : url.slice(0, 24);
                  return (
                    <li key={`${v.version_id}:ref:${idx}`} className="truncate">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary underline dark:text-primary">
                          {lab}
                        </a>
                      ) : (
                        "—"
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              "—"
            )}
            {(Array.isArray(v.external_refs) ? v.external_refs : []).length > 2 ? (
              <div className="text-[10px]">
                +{(Array.isArray(v.external_refs) ? v.external_refs : []).length - 2} more
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: (v) => (
          <div className="whitespace-nowrap text-[10px]">
            <div>{formatDateTimeCompact(v.created_at)}</div>
            {v.created_by ? <div className="text-muted-foreground">by {v.created_by}</div> : null}
          </div>
        ),
      },
    ];
    if (scopePinned || canEditVersionMetadata) {
      cols.push({
        id: "actions",
        header: "",
        className: "w-[9.5rem]",
        cell: (v) => (
          <div className="flex items-center justify-start gap-0.5">
            {scopePinned ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title={canEditVersionMetadata ? "Preview and edit content" : "Preview content"}
                aria-label={`Preview ${v.version}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setVersionEditorMsg("");
                  setVersionEditorId(v.version_id);
                  setVersionEditorLabel(String(v.version));
                  setVersionEditorDirty(false);
                  setVersionEditorOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {canEditVersionMetadata ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Edit metadata"
                aria-label={`Edit metadata for ${v.version}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setVersionMetaMsg("");
                  setVersionMetaId(v.version_id);
                  setVersionMetaLabel(String(v.version));
                  setVersionMetaTagInput("");
                  setVersionMetaRefUrl("");
                  setVersionMetaRefLabel("");
                  setVersionMetaOpen(true);
                }}
              >
                <Tags className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {scopePinned ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Download version"
                aria-label={`Download ${v.version}`}
                disabled={downloadingVersionId === v.version_id}
                onClick={async (e) => {
                  e.stopPropagation();
                  setDownloadMsg("");
                  setDownloadingVersionId(v.version_id);
                  try {
                    const base = (dataset?.name || "dataset").replace(/[^\w.-]+/g, "_");
                    const filename = `${base}_${v.version}.csv`;
                    await downloadDatasetVersion(
                      tenantId,
                      projectId,
                      v.version_id,
                      token,
                      filename
                    );
                    toastSuccess("Download started", filename);
                  } catch (err) {
                    const msg = `Download failed: ${String((err as Error)?.message || err)}`;
                    setDownloadMsg(msg);
                    toastError("Download failed", String((err as Error)?.message || err));
                  } finally {
                    setDownloadingVersionId(null);
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {canEditVersionMetadata ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[color:var(--status-failed-fg)] hover:bg-[color:var(--status-failed-bg)]"
                title="Delete version"
                aria-label={`Delete ${v.version}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteMsg("");
                  setDeleteVersionId(v.version_id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ),
      });
    }
    return cols;
  }, [
    canEditVersionMetadata,
    scopePinned,
    tenantId,
    projectId,
    token,
    dataset?.name,
    downloadingVersionId,
  ]);

  const datasetSubtitle = dataset ? `Updated ${formatDateTimeCompact(dataset.updated_at || dataset.created_at)}` : "";

  const lifecycleStages = ["Buffer", "Version", "Readiness", "Eligibility"] as const;
  const lifecycleStageIndex = useMemo(() => {
    const st = String(readinessQuery.data?.status || "pending").toLowerCase();
    if (st === "eligible" || st === "ready") return 3;
    if (st === "blocked") return 2;
    return 1;
  }, [readinessQuery.data?.status]);

  const overviewSummaryItems = useMemo(() => {
    const latest = versionsQuery.data?.items?.[0];
    const srcBadge = datasetVersionSourceBadge(latest || {});
    return [
      { label: "Latest version", value: latest?.version ?? "—", mono: true },
      {
        label: "Latest source",
        value: (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${srcBadge.className}`}>
            {srcBadge.label}
          </span>
        ),
      },
      { label: "Total versions", value: String((versionsQuery.data?.items || []).length) },
      { label: "Current size", value: String(Number(dataset?.current_size || 0)), mono: true },
      {
        label: "Readiness",
        value: (
          <span
            className={cn(
              "inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
              readinessStatusChipClass(readinessQuery.data?.status),
            )}
          >
            {String(readinessQuery.data?.status || "pending")}
          </span>
        ),
      },
    ];
  }, [versionsQuery.data?.items, dataset?.current_size, readinessQuery.data?.status]);

  const lineageVersionRow = useMemo(() => {
    const items = versionsQuery.data?.items || [];
    const vid = selectedVersionForReadiness;
    if (!vid) return null;
    return items.find((v) => v.version_id === vid) ?? null;
  }, [versionsQuery.data?.items, selectedVersionForReadiness]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SubpageBreadcrumb
        segments={[
          { label: "Datasets", href: "/datasets" },
          { label: dataset?.name ?? datasetId, mono: true },
        ]}
      />
      <ResourcePageHeader
        icon={Database}
        accent="emerald"
        title={dataset ? `Dataset · ${dataset.name}` : "Dataset"}
        subtitle={datasetSubtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 border-border bg-card text-xs">
              <Link href="/datasets">All datasets</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild={Boolean(selectedVersionForReadiness)}
              disabled={!selectedVersionForReadiness}
              className="h-8 gap-1.5 border-border bg-card text-xs disabled:opacity-40"
              title={
                lineageVersionRow
                  ? `Open lineage for ${formatVersionLabel(lineageVersionRow.version)} (pinned dataset_version_id)`
                  : undefined
              }
            >
              {selectedVersionForReadiness ? (
                <Link href={`/lineage?datasetVersion=${encodeURIComponent(selectedVersionForReadiness)}`}>
                  <GitBranch className="h-3.5 w-3.5" />
                  {lineageVersionRow ? `Lineage (${formatVersionLabel(lineageVersionRow.version)})` : "Lineage"}
                </Link>
              ) : (
                <>
                  <GitBranch className="h-3.5 w-3.5" />
                  Lineage
                </>
              )}
            </Button>
            {canEditVersionMetadata && scopePinned ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("h-8 gap-1.5 bg-card text-xs", STATUS_CHIP_CLASS.failed)}
                onClick={() => {
                  setDeleteMsg("");
                  setDeleteDatasetOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <DetailTabBar
        accent="emerald"
        tabs={[...DATASET_TABS]}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      />

      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_DATASET_DETAIL} /> : null}
      >

        {datasetQuery.isError && datasetQuery.isFetched ? (
          <div className={STATUS_CALLOUT_CLASS.failed}>
            Could not load dataset (check scope or id).
          </div>
        ) : null}

        {downloadMsg ? (
          <div className={STATUS_CALLOUT_CLASS.failed}>
            {downloadMsg}
          </div>
        ) : null}

        {isTabLoading ? (
          <DetailTabSkeleton variant={DATASET_TAB_SKELETON[activeTab] ?? "grid"} />
        ) : (
        <>
        {activeTab === "overview" ? (
          <div className="grid min-w-0 w-full grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailSection title="Lifecycle layers" accentBorder={DATASET_SECTION_ACCENT}>
              <div className="flex flex-wrap items-center gap-2">
                {lifecycleStages.map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px] font-medium",
                        i <= lifecycleStageIndex ? STATUS_CHIP_CLASS.success : "border-border text-muted-foreground/80"
                      )}
                    >
                      {label}
                    </Badge>
                    {i < lifecycleStages.length - 1 ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden />
                    ) : null}
                  </div>
                ))}
              </div>
            </DetailSection>

            <DetailSection title="Dataset summary" accentBorder={DATASET_SECTION_ACCENT}>
              <MetadataGrid columns={2} items={overviewSummaryItems} />
              {bufferMaterializationHints ? (
                <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Buffer / materialization</p>
                  <p>
                    Strategy:{" "}
                    <span className="font-mono text-foreground">{bufferMaterializationHints.strat}</span>
                  </p>
                  {bufferMaterializationHints.lastVid ? (
                    <p>
                      Last materialized:{" "}
                      <span className="text-foreground">
                        {bufferMaterializationHints.lastVersionLabel || bufferMaterializationHints.lastVid.slice(0, 8)}
                      </span>
                      {bufferMaterializationHints.lastAt ? (
                        <span> · {bufferMaterializationHints.lastAt}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p>Last materialized: —</p>
                  )}
                  {bufferMaterializationHints.strat === "rolling_accumulate" ? (
                    <p className={feedbackMessageClass("warning")}>
                      Rolling: buffer grows without auto vN snapshots — see Accumulation.
                    </p>
                  ) : bufferMaterializationHints.rowsToThreshold != null ? (
                    <p>
                      ~Rows until threshold:{" "}
                      <span className="font-semibold text-foreground">{bufferMaterializationHints.rowsToThreshold}</span>{" "}
                      <span className="text-muted-foreground/80">
                        (buffer {bufferMaterializationHints.cur} / {bufferMaterializationHints.tgt})
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {(readinessQuery.data?.eligibility_criteria || []).length ? (
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <p className="text-[11px] font-medium text-foreground">Gates (current policy / version)</p>
                  <div className="flex flex-wrap gap-2">
                    {(readinessQuery.data?.eligibility_criteria || []).map((c) => (
                      <Badge
                        key={c.code}
                        variant="outline"
                        className={cn(
                          "text-[11px]",
                          c.status === "pass" ? STATUS_CHIP_CLASS.success : STATUS_CHIP_CLASS.failed
                        )}
                      >
                        {c.status === "pass" ? "PASS" : "FAIL"} · {c.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </DetailSection>

            <DetailSection
              title="Runs using this dataset"
              accentBorder={DATASET_SECTION_ACCENT}
              className="lg:col-span-2"
              description="Training and pipeline runs that declared this dataset as input."
            >
              {!scopePinned ? (
                <p className="text-sm text-muted-foreground">
                  Pin a tenant and project in the header to list runs for this dataset.
                </p>
              ) : datasetRunsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading runs…</p>
              ) : datasetRunsQuery.isError ? (
                <p className={feedbackMessageClass("failed", "sm")}>{formatApiClientError(datasetRunsQuery.error)}</p>
              ) : datasetRunsQuery.items.length === 0 ? (
                <MlopsEmptyState
                  icon={Play}
                  title="No runs yet"
                  description="Runs that consume this dataset appear here after you trigger training or pipelines."
                />
              ) : (
                <>
                  <MlopsDataTable
                    tableId="dataset-runs"
                    title="Dataset runs"
                    description="Search and filter runs linked to this dataset."
                    columns={datasetRunColumns}
                    data={datasetRunsQuery.items}
                    keyExtractor={(run) => run.run_id}
                    onRowClick={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
                    emptyMessage="No runs."
                    className="text-sm"
                  />
                  {datasetRunsQuery.hasNextPage ? (
                    <div className="flex justify-center border-t border-border/60 py-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={datasetRunsQuery.isFetchingNextPage}
                        onClick={() => void datasetRunsQuery.fetchNextPage()}
                      >
                        {datasetRunsQuery.isFetchingNextPage ? "Loading…" : "Load more runs"}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </DetailSection>

            {!scopePinned ? (
              <DetailSection
                title="Version retention"
                accentBorder={DATASET_SECTION_ACCENT}
                description="Keep newest snapshots; purge older versions when policy is enabled. Referenced versions are skipped when protection is on."
              >
                <div className="space-y-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={retentionEnabled}
                      onChange={(e) => setRetentionEnabled(e.target.checked)}
                    />
                    <span className="text-foreground">Enable retention policy</span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="retention-max-versions" className="text-[11px]">
                        Keep newest N versions
                      </Label>
                      <Input
                        id="retention-max-versions"
                        value={retentionMaxVersions}
                        onChange={(e) => setRetentionMaxVersions(e.target.value)}
                        className="mt-1 h-8 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="retention-max-age" className="text-[11px]">
                        Max age (days, optional)
                      </Label>
                      <Input
                        id="retention-max-age"
                        value={retentionMaxAgeDays}
                        onChange={(e) => setRetentionMaxAgeDays(e.target.value)}
                        placeholder="e.g. 90"
                        className="mt-1 h-8 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={retentionProtectReferenced}
                      onChange={(e) => setRetentionProtectReferenced(e.target.checked)}
                    />
                    <span className="text-muted-foreground">
                      Protect versions referenced by lineage, readiness history, or last materialization
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={retentionSaveMutation.isPending}
                      onClick={() => retentionSaveMutation.mutate()}
                    >
                      Save policy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={retentionPreviewMutation.isPending || !retentionEnabled}
                      onClick={() => retentionPreviewMutation.mutate()}
                    >
                      Preview purge
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={
                        retentionApplyMutation.isPending ||
                        !retentionEnabled ||
                        !retentionPreview?.eligible_count
                      }
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete ${retentionPreview?.eligible_count ?? 0} dataset version(s)? This cannot be undone.`
                          )
                        ) {
                          return;
                        }
                        retentionApplyMutation.mutate();
                      }}
                    >
                      Apply purge
                    </Button>
                  </div>
                  {retentionPreview?.candidates?.length ? (
                    <div className="inset-surface px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {retentionPreview.candidates.slice(0, 8).map((c) => (
                        <div key={c.version_id}>
                          {c.version || c.version_id.slice(0, 8)} · {c.reasons.join(", ")}
                        </div>
                      ))}
                      {retentionPreview.candidates.length > 8 ? (
                        <p className="mt-1">+{retentionPreview.candidates.length - 8} more</p>
                      ) : null}
                    </div>
                  ) : null}
                  {retentionMsg ? <p className="text-muted-foreground">{retentionMsg}</p> : null}
                </div>
              </DetailSection>
            ) : null}

            <DetailSection
              title="Training eligibility"
              accentBorder={DATASET_SECTION_ACCENT}
              className="lg:col-span-2"
            >
              <div className="space-y-2 text-xs">
                {trainingEligibilityRows.length ? (
                  trainingEligibilityRows.map((r) => (
                    <div key={r.policyId} className="inset-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-foreground">{r.policyId}</span>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                            r.eligible ? STATUS_CHIP_CLASS.success : STATUS_CHIP_CLASS.failed,
                          )}
                        >
                          {r.eligible ? "ELIGIBLE" : "BLOCKED"}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        mode={r.triggerMode} · rows={r.currentSize}/{r.requiredSize}
                        {r.freshnessHours != null ? ` · fresh≤${r.freshnessHours}h` : ""}
                        {r.validationRulesCount > 0 ? ` · rules=${r.validationRulesCount}` : ""}
                        {r.modelId ? ` · model=${r.modelId}` : " · model=any"}
                      </div>
                      {!r.eligible && r.reasons.length ? (
                        <p className={`mt-1 ${STATUS_CHIP_TEXT.failed}`}>{r.reasons.join(" ; ")}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">No training policies yet.</div>
                )}
              </div>
            </DetailSection>
          </div>
      ) : null}

      {activeTab === "readiness" ? (
        <div className="flex min-w-0 w-full flex-col gap-4">
        <DetailSection
          title="Readiness policy evaluation"
          accentBorder={DATASET_SECTION_ACCENT}
          className="min-w-0"
          bodyClassName="min-w-0 flex flex-col gap-6"
        >
            <div className="min-w-0 max-w-md">
              <SelectDropdown
                value={selectedVersionId}
                onChange={setSelectedVersionId}
                options={readinessVersionSelectOptions}
                buttonClassName="panel-surface bg-muted/20 px-3 py-2 text-sm"
                disabled={readinessVersionSelectOptions.length === 0}
                aria-label="Dataset version for readiness"
              />
            </div>
            <DatasetTrainingPolicyPanel
              tenantId={tenantId}
              projectId={projectId}
              datasetId={datasetId}
              token={token}
              scopePinned={scopePinned}
              policies={policiesQuery.data?.items || []}
              selectedPolicyId={selectedPolicyId}
              onSelectedPolicyIdChange={setSelectedPolicyId}
              onPolicyMutated={refetchPolicyReadiness}
            />
            {readinessQuery.data ? (
              <div className="min-w-0 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-foreground">
                  <span className="text-muted-foreground">Status:</span>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase",
                      readinessStatusChipClass(
                        readinessQuery.data.eligibility_status || readinessQuery.data.status,
                      ),
                    )}
                  >
                    {String(readinessQuery.data.eligibility_status || readinessQuery.data.status || "blocked")}
                  </span>
                </div>
                <PolicyConfigSummary policy={selectedPolicy} versionCreatedAt={selectedVersionCreatedAt} />
                <div className="mb-3 grid min-w-0 gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    Current / required rows:{" "}
                    <span className="tabular-nums text-foreground">{readinessQuery.data.current_size}</span>
                    {" / "}
                    <span className="tabular-nums text-foreground">{readinessQuery.data.required_size}</span>
                  </div>
                  <div>
                    Ready:{" "}
                    <span
                      className={cn(
                        "font-medium",
                        readinessQuery.data.ready ? STATUS_CHIP_TEXT.success : STATUS_CHIP_TEXT.failed,
                      )}
                    >
                      {readinessQuery.data.ready ? "yes" : "no"}
                    </span>
                  </div>
                  <div className="min-w-0 break-words sm:col-span-2">
                    Policy{" "}
                    <span className="break-all font-mono text-foreground">{readinessQuery.data.policy_id || "—"}</span>
                    {" · Version "}
                    <span className="break-all font-mono text-foreground">{readinessQuery.data.dataset_version_id || "—"}</span>
                    {readinessQuery.data.evaluated_at ? (
                      <>
                        {" · Evaluated "}
                        <span className="font-mono text-foreground">
                          {formatDateTimeCompact(readinessQuery.data.evaluated_at)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="px-3 py-1 text-xs"
                    disabled={
                      !selectedPolicyId ||
                      evaluatePersistMutation.isPending ||
                      readinessVersionSelectOptions.length === 0
                    }
                    onClick={() => {
                      setEvaluatePersistMsg(null);
                      evaluatePersistMutation.mutate();
                    }}
                  >
                    {evaluatePersistMutation.isPending ? "Recording…" : "Evaluate now (persist)"}
                  </Button>
                  {evaluatePersistMsg ? (
                    <span className="text-xs text-muted-foreground">{evaluatePersistMsg}</span>
                  ) : null}
                </div>
                {(readinessQuery.data.eligibility_criteria || []).length ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <div className="mb-1 text-xs text-muted-foreground">
                      <span>Criteria</span>
                    </div>
                    {(readinessQuery.data.eligibility_criteria || []).map((c) => (
                      <div key={c.code} className="flex min-w-0 items-center justify-between gap-2 inset-surface px-2 py-1 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground">{c.label}</span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                            c.status === "pass" ? STATUS_CHIP_CLASS.success : STATUS_CHIP_CLASS.failed,
                          )}
                        >
                          {c.status === "pass" ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{readinessQuery.isLoading ? "Loading…" : "—"}</p>
            )}
        </DetailSection>

        <DetailSection
          title="Readiness evaluations"
          className="min-w-0"
          bodyClassName="min-w-0"
          accentBorder={DATASET_SECTION_ACCENT}
          headerActions={
            <FilterChips
              options={[
                { id: "all", label: "All" },
                { id: "eligible", label: "Eligible", tone: "success" },
                { id: "blocked", label: "Blocked", tone: "failed" },
              ]}
              value={evaluationStatusFilter}
              onChange={(id) => {
                setEvaluationStatusFilter(id);
              }}
            />
          }
        >
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {evaluationItems.length} evaluation{evaluationItems.length === 1 ? "" : "s"}
              {readinessEvaluationsQuery.hasNextPage ? " loaded" : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SelectDropdown
                value={evaluationSourceFilter}
                onChange={(v) => {
                  setEvaluationSourceFilter(v);
                }}
                options={READINESS_EVAL_SOURCE_FILTER_OPTIONS}
                buttonClassName="panel-surface px-2 py-1 text-xs"
                className="min-w-[10rem]"
                aria-label="Filter evaluations by source"
              />
              <SelectDropdown
                value={evaluationPolicyFilter}
                onChange={(v) => {
                  setEvaluationPolicyFilter(v);
                }}
                options={evaluationPolicyFilterOptions}
                buttonClassName="panel-surface px-2 py-1 text-xs"
                className="min-w-[10rem]"
                aria-label="Filter evaluations by policy"
              />
            </div>
          </div>
          {readinessEvaluationsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : evaluationItems.length === 0 ? (
            <MlopsEmptyState
              icon={Database}
              title="No readiness evaluations yet"
              description="Run evaluate from the Readiness tab controls above, or relax filters."
            />
          ) : (
            <>
              <MlopsDataTable
                tableId="dataset-evaluations"
                title="Readiness evaluations"
                description="Search and filter readiness evaluation history."
                columns={evaluationColumns}
                data={evaluationItems}
                keyExtractor={(row) => row.evaluation_id}
                emptyMessage="No evaluations."
                className="min-w-0 text-sm"
              />
              {readinessEvaluationsQuery.hasNextPage ? (
                <div className="flex justify-center border-t border-border/60 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={readinessEvaluationsQuery.isFetchingNextPage}
                    onClick={() => void readinessEvaluationsQuery.fetchNextPage()}
                  >
                    {readinessEvaluationsQuery.isFetchingNextPage ? "Loading…" : "Load more evaluations"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </DetailSection>
        </div>
      ) : null}

      {activeTab === "accumulation" ? (
        <DetailSection title="Accumulation buffer" accentBorder={DATASET_SECTION_ACCENT} className="min-w-0">
            {bufferQuery.isLoading && !bufferQuery.data ? (
              <p className="text-xs text-muted-foreground">Loading buffer…</p>
            ) : bufferQuery.data ? (
              <div className="space-y-3 text-xs text-muted-foreground">
                {accumulationStrategyDraft === "snapshot_on_schedule" && bufferMaterializationHints ? (
                  <div className="inset-surface px-3 py-2 text-[11px] text-muted-foreground">
                    Schedule mode: buffer{" "}
                    <span className="font-mono text-foreground">{bufferMaterializationHints.cur}</span>/
                    <span className="font-mono text-foreground">{bufferMaterializationHints.tgt}</span> — versions come from
                    project <span className="font-medium text-foreground">Run schedule tick</span> (below), not a wall-clock ETA.
                  </div>
                ) : null}
                {accumulationStrategyDraft === "rolling_accumulate" ? (
                  <div className={STATUS_CALLOUT_CLASS.warning}>
                    <span className="font-semibold text-foreground">Rolling accumulate:</span> no auto snapshot at threshold — use{" "}
                    <span className="font-semibold">Materialize now</span> or switch strategy.
                  </div>
                ) : null}
                {accumulationStrategyDraft === "snapshot_on_threshold" &&
                bufferMaterializationHints &&
                bufferMaterializationHints.rowsToThreshold != null ? (
                  <div className="inset-surface px-3 py-2 text-[11px] text-muted-foreground">
                    ~<span className="font-semibold text-foreground">{bufferMaterializationHints.rowsToThreshold}</span> rows to
                    target ({bufferMaterializationHints.cur}/{bufferMaterializationHints.tgt}).
                  </div>
                ) : null}
                {accumulationStrategyDraft === "manual_materialize_only" ? (
                  <div className="inset-surface px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Manual only</span> — row count won&apos;t auto-materialize;
                    use <span className="font-semibold">Materialize now</span>.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Strategy</span>
                    <SelectDropdown
                      value={accumulationStrategyDraft}
                      onChange={(v) => {
                        setAccumulationMsg("");
                        setAccumulationStrategyDraft(v);
                      }}
                      options={ACCUMULATION_STRATEGY_OPTIONS}
                      className="min-w-[12rem]"
                      buttonClassName="panel-surface bg-muted/20 px-2 py-2 text-sm"
                      aria-label="Accumulation strategy"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="whitespace-nowrap">Target threshold (min)</span>
                    <input
                      type="number"
                      min={1}
                      value={accumulationThresholdDraft}
                      onChange={(e) => {
                        setAccumulationMsg("");
                        setAccumulationThresholdDraft(e.target.value);
                      }}
                      className="w-32 appearance-none panel-surface bg-muted/20 px-2 py-2 text-sm text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1 text-xs"
                    disabled={patchBufferMutation.isPending || materializeBufferMutation.isPending}
                    onClick={() => {
                      setAccumulationMsg("");
                      patchBufferMutation.mutate();
                    }}
                  >
                    Save target
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1 text-xs"
                    disabled={
                      materializeBufferMutation.isPending ||
                      materializeScheduledMutation.isPending ||
                      !["manual_materialize_only", "snapshot_on_schedule"].includes(accumulationStrategyDraft)
                    }
                    onClick={() => {
                      setAccumulationMsg("");
                      materializeBufferMutation.mutate();
                    }}
                  >
                    Materialize now
                  </Button>
                  {accumulationStrategyDraft === "snapshot_on_schedule" ? (
                    <>
                      <label className="flex items-center gap-2">
                        <span className="whitespace-nowrap">Tick limit</span>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={scheduleTickLimit}
                          onChange={(e) => {
                            setAccumulationMsg("");
                            setScheduleTickLimit(e.target.value);
                          }}
                          className="w-24 appearance-none panel-surface bg-muted/20 px-2 py-2 text-sm text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        disabled={materializeScheduledMutation.isPending || materializeBufferMutation.isPending}
                        onClick={() => {
                          setAccumulationMsg("");
                          setScheduleTickResult(null);
                          materializeScheduledMutation.mutate();
                        }}
                      >
                        Run schedule tick
                      </Button>
                    </>
                  ) : null}
                </div>
                {accumulationMsg ? (
                  <p className={accumulationFeedbackClass(accumulationMsg)}>{accumulationMsg}</p>
                ) : null}
                {scheduleTickResult ? (
                  <div className="space-y-2 inset-surface px-3 py-2 text-[11px]">
                    <div className="text-muted-foreground">
                      Last tick: checked={scheduleTickResult.checked}, materialized={scheduleTickResult.materialized_count},
                      skipped={scheduleTickResult.skipped.length}
                    </div>
                    {scheduleTickResult.materialized.length ? (
                      <div>
                        <div className="mb-1 font-semibold text-foreground">Materialized</div>
                        <div className="space-y-1">
                          {scheduleTickResult.materialized.slice(0, 8).map((row) => (
                            <div key={`${row.dataset_id}:${row.dataset_version_id}`} className="text-muted-foreground">
                              <span className="font-mono text-foreground">{row.dataset_id}</span> {"->"}{" "}
                              <span className="font-mono text-foreground">{row.version}</span>{" "}
                              (<span className="font-mono">{row.dataset_version_id.slice(0, 8)}…</span>)
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {scheduleTickResult.skipped.length ? (
                      <div>
                        <div className="mb-1 font-semibold text-foreground">Skipped</div>
                        <div className="space-y-1">
                          {scheduleTickResult.skipped.slice(0, 8).map((row, idx) => (
                            <div key={`${String(row.dataset_id || "na")}:${idx}`} className="text-muted-foreground">
                              <span className="font-mono text-foreground">{String(row.dataset_id || "unknown")}</span> ·{" "}
                              {String(row.reason || "skipped")}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <details className="mt-2 inset-surface px-3 py-2">
                  <summary className="cursor-pointer select-none text-xs font-medium text-foreground">
                    All buffer fields (diagnostics)
                  </summary>
                  <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <div>buffer_id: <span className="font-mono text-foreground">{String(bufferQuery.data.buffer_id || "—")}</span></div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>source_type (stored):</span>
                  <span className="font-mono text-xs text-foreground">
                    {String(bufferQuery.data.source_type || "runtime_feedback")}
                  </span>
                  {(() => {
                    const b = datasetSourceTypeBadge(
                      bufferQuery.data.canonical_source_type || bufferQuery.data.source_type
                    );
                    return (
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>
                        {b.label}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">window_start</span> /{" "}
                  <span className="font-medium text-foreground">window_end</span> come from ingestion services (not the schedule
                  tick).
                </p>
                <div>accumulation_strategy: <span className="font-semibold text-foreground">{String(bufferQuery.data.accumulation_strategy || "snapshot_on_threshold")}</span></div>
                <div>window_strategy: <span className="font-semibold text-foreground">{String(bufferQuery.data.window_strategy || "threshold")}</span></div>
                <div>window_status: <span className="font-semibold text-foreground">{String(bufferQuery.data.window_status || "active")}</span></div>
                <div>materialization_strategy: <span className="font-semibold text-foreground">{String(bufferQuery.data.materialization_strategy || "snapshot_on_threshold")}</span></div>
                <div>record_count: <span className="font-semibold text-foreground">{Number(bufferQuery.data.record_count ?? bufferQuery.data.current_size ?? 0)}</span></div>
                <div>progress: <span className="font-semibold text-foreground">{Number(bufferQuery.data.current_size || 0)} / {Number(bufferQuery.data.target_threshold || 0)}</span></div>
                <div>created_at: <span className="text-foreground">{formatDateTimeCompact(String(bufferQuery.data.created_at || bufferQuery.data.started_at || ""))}</span></div>
                <div>last_ingested_at: <span className="text-foreground">{formatDateTimeCompact(String(bufferQuery.data.last_ingested_at || bufferQuery.data.updated_at || ""))}</span></div>
                <div>last_materialized_version: <span className="font-mono text-foreground">{String(bufferQuery.data.last_materialized_version_id || "—")}</span></div>
                <div>last_materialized_at: <span className="text-foreground">{formatDateTimeCompact(String(bufferQuery.data.last_materialized_at || ""))}</span></div>
                  </div>
                </details>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No active accumulation buffer yet.</p>
            )}
        </DetailSection>
      ) : null}

      {activeTab === "versions" ? (
        <DetailSection
          title="Dataset versions"
          accentBorder={DATASET_SECTION_ACCENT}
          className="min-w-0"
        >
            {versionsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (versionsQuery.data?.items || []).length === 0 ? (
              <MlopsEmptyState
                icon={Database}
                title="No versions yet"
                description="Materialize or import a dataset version to see immutable snapshots here."
              />
            ) : (
              <>
                <DatasetVersionDiffPanel
                  tenantId={tenantId}
                  projectId={projectId}
                  datasetId={datasetId}
                  token={token}
                  versions={versionsQuery.data?.items || []}
                />
                <DatasetVersionProvenancePanel
                  tenantId={tenantId}
                  projectId={projectId}
                  datasetId={datasetId}
                  token={token}
                  versions={versionsQuery.data?.items || []}
                  onOpenAccumulation={() => setActiveTab("accumulation")}
                />
                <MlopsDataTable
                tableId="dataset-versions"
                title="Dataset versions"
                description="Search, filter by quality/source, and sort versions."
                columns={versionColumns}
                data={versionsQuery.data?.items || []}
                keyExtractor={(v) => v.version_id}
                emptyMessage="No versions yet."
                className="text-sm"
              />
              </>
            )}
        </DetailSection>
      ) : null}

      {activeTab === "training" ? (
        <DetailSection title="Run / Train" accentBorder={DATASET_SECTION_ACCENT} className="min-w-0">
          <ExecutionIntentPanel
            datasetId={datasetId}
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            scopePinned={scopePinned}
            versions={versionsQuery.data?.items || []}
            versionsLoading={versionsQuery.isLoading}
            policyId={selectedPolicyId || undefined}
            trainingPolicies={policiesQuery.data?.items || []}
          />
        </DetailSection>
      ) : null}
        </>
        )}
      </PageScrollBody>

      <Dialog
        open={versionEditorOpen}
        onOpenChange={(open) => {
          if (open) setVersionEditorOpen(true);
          else requestVersionEditorClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="dialog-viewport-90 flex flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader
            className={cn(
              "relative shrink-0 border-b border-border py-4 pl-6",
              canEditVersionMetadata && versionEditorDirty ? "pr-52" : "pr-14"
            )}
          >
            <div className="absolute top-3 right-4 flex items-center gap-2">
              {canEditVersionMetadata && versionEditorDirty ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={versionEditorSaving}
                  onClick={() => void saveVersionEditorChanges()}
                >
                  {versionEditorSaving ? "Saving…" : "Save changes"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Close preview"
                onClick={requestVersionEditorClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogTitle>Dataset version preview</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-foreground">{formatVersionLabel(versionEditorLabel)}</span>
              <span className="text-muted-foreground"> — scroll to load more; edit cells inline</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-4">
            {versionEditorId ? (
              <DatasetVersionScrollEditor
                ref={versionEditorRef}
                tenantId={tenantId}
                projectId={projectId}
                versionId={versionEditorId}
                token={token}
                canEdit={canEditVersionMetadata}
                onDirtyChange={setVersionEditorDirty}
              />
            ) : null}
            {versionEditorMsg ? (
              <div className={cn("mt-2 shrink-0", STATUS_CALLOUT_CLASS.failedCompact)}>
                {versionEditorMsg}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={versionEditorDiscardOpen} onOpenChange={setVersionEditorDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits. Do you want to save before closing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" variant="secondary" onClick={() => closeVersionEditor()}>
              Don&apos;t save
            </Button>
            <Button
              type="button"
              disabled={versionEditorSaving}
              onClick={() => {
                void (async () => {
                  const ok = await saveVersionEditorChanges();
                  if (ok) closeVersionEditor();
                })();
              }}
            >
              {versionEditorSaving ? "Saving…" : "Save"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={versionMetaOpen}
        onOpenChange={(open) => {
          setVersionMetaOpen(open);
          if (!open) setVersionMetaMsg("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add version metadata</DialogTitle>
            <DialogDescription>
              Append-only merge for <span className="font-mono text-foreground">{formatVersionLabel(versionMetaLabel)}</span> (
              <span className="font-mono text-[10px] text-muted-foreground">{versionMetaId.slice(0, 8)}…</span>). Empty
              submit is rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="vm-tags" className="text-xs text-muted-foreground">
                New tags (comma or newline separated)
              </Label>
              <Input
                id="vm-tags"
                className="mt-1 font-mono text-xs"
                value={versionMetaTagInput}
                onChange={(e) => setVersionMetaTagInput(e.target.value)}
                placeholder="e.g. pii-reviewed, staging"
              />
            </div>
            <div>
              <Label htmlFor="vm-ref-url" className="text-xs text-muted-foreground">
                External reference URL (optional)
              </Label>
              <Input
                id="vm-ref-url"
                className="mt-1 font-mono text-xs"
                value={versionMetaRefUrl}
                onChange={(e) => setVersionMetaRefUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label htmlFor="vm-ref-label" className="text-xs text-muted-foreground">
                Link label (optional)
              </Label>
              <Input
                id="vm-ref-label"
                className="mt-1 text-xs"
                value={versionMetaRefLabel}
                onChange={(e) => setVersionMetaRefLabel(e.target.value)}
                placeholder="Human-readable title"
              />
            </div>
            {versionMetaMsg ? (
              <div className={STATUS_CALLOUT_CLASS.warningCompact}>
                {versionMetaMsg}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setVersionMetaOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={patchVersionMetadataMutation.isPending}
              onClick={() => patchVersionMetadataMutation.mutate()}
            >
              {patchVersionMetadataMutation.isPending ? "Saving…" : "Append"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDatasetOpen} onOpenChange={setDeleteDatasetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete dataset</DialogTitle>
            <DialogDescription>
              Permanently delete <span className="font-mono text-foreground">{dataset?.name ?? datasetId}</span>, all
              versions, and the accumulation buffer. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteMsg ? (
            <p className={feedbackMessageClass("failed")}>{deleteMsg}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteDatasetOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteDatasetMutation.isPending}
              onClick={() => deleteDatasetMutation.mutate()}
            >
              {deleteDatasetMutation.isPending ? "Deleting…" : "Delete dataset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteVersionId)} onOpenChange={(open) => !open && setDeleteVersionId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete dataset version</DialogTitle>
            <DialogDescription>
              Remove this immutable snapshot and its lineage edges. Other versions are kept.
            </DialogDescription>
          </DialogHeader>
          {deleteMsg ? (
            <p className={feedbackMessageClass("failed")}>{deleteMsg}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteVersionId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteVersionMutation.isPending || !deleteVersionId}
              onClick={() => deleteVersionId && deleteVersionMutation.mutate(deleteVersionId)}
            >
              {deleteVersionMutation.isPending ? "Deleting…" : "Delete version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
