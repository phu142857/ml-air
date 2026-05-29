"use client";

import { ChevronRight, Database, Download, Eye, GitBranch, Loader2, Plus, Tags, Trash2, X } from "lucide-react";
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
import {
  fetchDataset,
  fetchDatasetBuffer,
  fetchDatasetReadinessEvaluations,
  fetchDatasetReadiness,
  postDatasetReadinessEvaluate,
  createDatasetTrainingPolicy,
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
  upsertDatasetTrainingPolicy,
  type DatasetVersionItem
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { datasetSourceTypeBadge, datasetVersionSourceBadge } from "@/lib/dataset-source-type";
import { datasetStatusBadgeClass, normalizeDatasetStatus } from "@/lib/status-style";
import { describeTrainError } from "@/lib/describe-train-error";
import { useAppContext } from "@/lib/app-context";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_DATASET_DETAIL } from "@/lib/scope-messages";
import { cn, formatDateTimeCompact } from "@/lib/utils";

const DATASET_TABS = [
  { id: "overview", label: "Overview" },
  { id: "versions", label: "Versions" },
  { id: "readiness", label: "Readiness" },
  { id: "accumulation", label: "Accumulation" },
  { id: "training", label: "Run / Train" },
] as const;

function lifecycleDomainChip(kind: "readiness" | "eligibility"): { label: string; className: string } {
  if (kind === "readiness") {
    return {
      label: "Dataset readiness",
      className:
        "border-primary/40 bg-primary/10 text-primary backdrop-blur-sm dark:border-primary/30 dark:bg-primary/15 dark:text-primary"
    };
  }
  return {
    label: "Training eligibility",
    className:
      "border-primary/40 bg-primary/10 text-primary backdrop-blur-sm dark:border-primary/30 dark:bg-primary/15 dark:text-primary/90"
  };
}

function DomainChip({ kind }: { kind: "readiness" | "eligibility" }) {
  const c = lifecycleDomainChip(kind);
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.className}`}
    >
      {c.label}
    </span>
  );
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

const POLICY_TRIGGER_MODE_OPTIONS = [
  { value: "manual", label: "manual" },
  { value: "auto_ready", label: "auto_ready" },
  { value: "schedule", label: "schedule" }
];

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

const READINESS_EVALUATIONS_PAGE_SIZE = 20;

type ReadinessEvaluationRow = Awaited<ReturnType<typeof fetchDatasetReadinessEvaluations>>["items"][number];

export default function DatasetHubPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = decodeURIComponent(params.datasetId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token, accessibleScopes } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [policyMsg, setPolicyMsg] = useState("");
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
  const [policyRequiredSizeDraft, setPolicyRequiredSizeDraft] = useState("1000");
  const [newPolicyTriggerMode, setNewPolicyTriggerMode] = useState("manual");
  const [evaluationCurrentPage, setEvaluationCurrentPage] = useState(1);
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
      setRetentionMsg("Policy saved");
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.retentionPolicy(tenantId, projectId, datasetId)
      });
      window.setTimeout(() => setRetentionMsg(""), 2000);
    },
    onError: (e: unknown) => setRetentionMsg(String((e as Error)?.message || e))
  });

  const retentionPreviewMutation = useMutation({
    mutationFn: async () => {
      await retentionSaveMutation.mutateAsync();
      return previewDatasetRetention(tenantId, projectId, datasetId, token);
    },
    onSuccess: (data) => {
      setRetentionPreview({ eligible_count: data.eligible_count, candidates: data.candidates || [] });
      setRetentionMsg(
        data.eligible_count
          ? `Preview: ${data.eligible_count} version(s) eligible for purge`
          : "Preview: nothing to purge"
      );
    },
    onError: (e: unknown) => setRetentionMsg(String((e as Error)?.message || e))
  });

  const retentionApplyMutation = useMutation({
    mutationFn: () => applyDatasetRetention(tenantId, projectId, datasetId, token, false),
    onSuccess: async (data) => {
      setRetentionMsg(`Deleted ${(data.deleted || []).length} version(s)`);
      setRetentionPreview(null);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) });
    },
    onError: (e: unknown) => setRetentionMsg(String((e as Error)?.message || e))
  });

  useEffect(() => {
    setSelectedVersionId("");
    setEvaluationCurrentPage(1);
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
      setAccumulationMsg("Materialization target saved.");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.buffer(tenantId, projectId, datasetId) });
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.trainingEligibility(tenantId, projectId, datasetId),
        exact: false
      });
    },
    onError: (err: unknown) => {
      setAccumulationMsg(describeTrainError(err));
    }
  });
  const materializeBufferMutation = useMutation({
    mutationFn: async () => materializeDatasetBuffer(tenantId, projectId, datasetId, token),
    onSuccess: async (out) => {
      setAccumulationMsg(`Materialized ${out.version} (${out.dataset_version_id.slice(0, 8)}…).`);
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
    onError: (err: unknown) => setAccumulationMsg(describeTrainError(err))
  });
  const materializeScheduledMutation = useMutation({
    mutationFn: async () =>
      materializeScheduledDatasetBuffers(tenantId, projectId, token, Number.parseInt(scheduleTickLimit, 10) || 50),
    onSuccess: async (out) => {
      setScheduleTickResult(out);
      setAccumulationMsg(`Schedule tick checked=${out.checked}, materialized=${out.materialized_count}.`);
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
    onError: (err: unknown) => setAccumulationMsg(describeTrainError(err))
  });
  const readinessEvaluationsQuery = useQuery({
    queryKey: mlairKeys.datasets.readinessEvaluations(tenantId, projectId, datasetId),
    queryFn: () =>
      fetchDatasetReadinessEvaluations(tenantId, projectId, datasetId, token, 200, 0),
    enabled: Boolean(datasetId && token && dataset),
    refetchOnMount: "always",
    ...poll,
  });
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
      setEvaluatePersistMsg(`Recorded evaluation ${String(out.evaluation_id || "").slice(0, 8)}…`);
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
      setEvaluatePersistMsg(describeTrainError(err));
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
      setVersionMetaTagInput("");
      setVersionMetaRefUrl("");
      setVersionMetaRefLabel("");
      setVersionMetaOpen(false);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId) });
    },
    onError: (err: unknown) => {
      setVersionMetaMsg(describeTrainError(err));
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
            label: `v${v.version}`
          }));
    return [
      { value: head.version_id, label: `Head snapshot (v${head.version})` },
      ...older
    ];
  }, [versionsQuery.data?.items]);
  const policySelectOptions = useMemo(
    () =>
      (policiesQuery.data?.items || []).map((p) => ({
        value: p.policy_id,
        label: `${p.trigger_mode} · min_rows=${p.required_size}`
      })),
    [policiesQuery.data?.items]
  );

  const trainingEligibilityRows = useMemo(() => {
    const items = eligibilityQuery.data?.items ?? [];
    return items.map((it) => ({
      policyId: it.policy_id,
      triggerMode: it.trigger_mode,
      modelId: it.model_id ? String(it.model_id) : null,
      requiredSize: it.required_size,
      currentSize: it.current_size,
      eligible: it.eligible,
      reasons: (it.reasons || []).map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
    }));
  }, [eligibilityQuery.data]);

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
      return v ? `v${v.version}` : `${lastVid.slice(0, 8)}…`;
    })();
    return { strat, cur, tgt, rowsToThreshold, lastVid, lastAt, lastVersionLabel };
  }, [bufferQuery.data, versionsQuery.data?.items]);

  const allEvaluationItems = readinessEvaluationsQuery.data?.items ?? [];
  const filteredEvaluations = useMemo(() => {
    return allEvaluationItems.filter((row) => {
      const statusOk =
        evaluationStatusFilter === "all" ||
        String(row.status || "").toLowerCase() === evaluationStatusFilter.toLowerCase();
      const policyOk =
        evaluationPolicyFilter === "all" || String(row.policy_id || "") === evaluationPolicyFilter;
      const sourceVal = String((row as { source?: string }).source || "manual").toLowerCase();
      const sourceOk =
        evaluationSourceFilter === "all" || sourceVal === evaluationSourceFilter.toLowerCase();
      return statusOk && policyOk && sourceOk;
    });
  }, [allEvaluationItems, evaluationStatusFilter, evaluationPolicyFilter, evaluationSourceFilter]);
  const evaluationTotalPages = Math.max(1, Math.ceil(filteredEvaluations.length / READINESS_EVALUATIONS_PAGE_SIZE));
  const paginatedEvaluations = useMemo(
    () =>
      filteredEvaluations.slice(
        (evaluationCurrentPage - 1) * READINESS_EVALUATIONS_PAGE_SIZE,
        evaluationCurrentPage * READINESS_EVALUATIONS_PAGE_SIZE
      ),
    [filteredEvaluations, evaluationCurrentPage]
  );

  const evaluationColumns: DataTableColumn<ReadinessEvaluationRow>[] = useMemo(
    () => [
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
              row.status === "eligible"
                ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]"
                : "border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]"
            }`}
          >
            {String(row.status || "blocked").toUpperCase()}
          </span>
        ),
      },
      {
        id: "sizes",
        header: "Current / Required",
        cell: (row) => (
          <span>
            {Number(row.current_size || 0)} / {Number(row.required_size || 0)}
          </span>
        ),
      },
      {
        id: "dataset_version",
        header: "Version",
        cell: (row) => (
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            {row.dataset_version_id || "—"}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: (row) => (
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            {String(row.source || "manual")}
          </span>
        ),
      },
      {
        id: "why",
        header: "Why blocked",
        className: "max-w-[14rem]",
        cell: (row) => (
          <div className="text-xs text-muted-foreground" title={formatEvaluationReasons(row.reasons)}>
            {String(row.status || "").toLowerCase() === "eligible" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="line-clamp-2 text-[color:var(--status-pending-fg)]/90">
                {formatEvaluationReasons(row.reasons) || "—"}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "evaluated",
        header: "Evaluated",
        cell: (row) => <span>{formatDateTimeCompact(row.evaluated_at)}</span>,
      },
    ],
    [],
  );

  useEffect(() => {
    setEvaluationCurrentPage((p) => Math.min(p, evaluationTotalPages));
  }, [evaluationTotalPages]);
  const policyPresets = [
    { id: "small", label: "Small incremental training", requiredSize: 100 },
    { id: "daily", label: "Daily retrain", requiredSize: 1000 },
    { id: "production", label: "Production promotion gate", requiredSize: 5000 }
  ] as const;
  const applyPolicyRequiredSize = async (requiredSizeValue: number) => {
    const req = Math.max(1, Math.floor(requiredSizeValue));
    const current = (policiesQuery.data?.items || []).find((p) => p.policy_id === selectedPolicyId);
    if (!current) return;
    try {
      setPolicyMsg("");
      await upsertDatasetTrainingPolicy(tenantId, projectId, datasetId, token, {
        policy_id: current.policy_id,
        model_id: current.model_id || undefined,
        required_size: req,
        freshness_hours: current.freshness_hours,
        trigger_mode: current.trigger_mode,
        validation_rules: current.validation_rules || []
      });
      setPolicyRequiredSizeDraft(String(req));
      await policiesQuery.refetch();
      await readinessQuery.refetch();
      setPolicyMsg(`Policy updated to ${req} rows and re-evaluated.`);
    } catch (err) {
      setPolicyMsg(`Policy update failed: ${String((err as Error)?.message || err)}`);
    }
  };
  const createPolicy = async () => {
    const req = Math.max(1, Number.parseInt(policyRequiredSizeDraft, 10) || 1);
    try {
      setPolicyMsg("");
      const created = await createDatasetTrainingPolicy(tenantId, projectId, datasetId, token, {
        required_size: req,
        freshness_hours: 24,
        trigger_mode: newPolicyTriggerMode,
        validation_rules: []
      });
      await policiesQuery.refetch();
      setSelectedPolicyId(created.policy_id);
      setPolicyRequiredSizeDraft(String(created.required_size || req));
      await readinessQuery.refetch();
      setPolicyMsg("Policy created and selected.");
    } catch (err) {
      setPolicyMsg(`Create policy failed: ${String((err as Error)?.message || err)}`);
    }
  };
  useEffect(() => {
    const firstPolicy = policiesQuery.data?.items?.[0];
    if (!firstPolicy) return;
    setSelectedPolicyId((prev) => prev || firstPolicy.policy_id);
    setPolicyRequiredSizeDraft(String(firstPolicy.required_size || 1000));
  }, [policiesQuery.data]);
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
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
      });
      setVersionEditorDirty(false);
    } else {
      setVersionEditorMsg("Save failed — check edits above.");
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
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId) });
      router.push("/datasets");
    },
    onError: (err) => setDeleteMsg(String((err as Error)?.message || err)),
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: string) =>
      deleteDatasetVersion(tenantId, projectId, datasetId, versionId, token),
    onSuccess: async () => {
      setDeleteVersionId(null);
      setDeleteMsg("");
      await queryClient.invalidateQueries({
        queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
      });
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.detail(tenantId, projectId, datasetId) });
    },
    onError: (err) => setDeleteMsg(String((err as Error)?.message || err)),
  });

  const versionColumns: DataTableColumn<DatasetVersionItem>[] = useMemo(() => {
    const cols: DataTableColumn<DatasetVersionItem>[] = [
      {
        id: "version",
        header: "Version",
        cell: (v) => <span className="whitespace-nowrap font-mono text-xs">{v.version}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: (v) => (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${datasetStatusBadgeClass(v.status)}`}>
            {normalizeDatasetStatus(v.status)}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: (v) => {
          const b = datasetVersionSourceBadge(v);
          return (
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>
              {b.label}
            </span>
          );
        },
      },
      {
        id: "rows",
        header: "Rows",
        cell: (v) => <>{Number(v.record_count || 0)}</>,
      },
      {
        id: "tags",
        header: "Tags",
        className: "max-w-[12rem]",
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
        className: "max-w-[10rem]",
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
        cell: (v) => <span className="whitespace-nowrap">{formatDateTimeCompact(v.created_at)}</span>,
      },
    ];
    if (scopePinned || canEditVersionMetadata) {
      cols.push({
        id: "actions",
        header: "",
        className: "w-[9.5rem]",
        cell: (v) => (
          <div className="flex items-center justify-end gap-0.5">
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
                    await downloadDatasetVersion(
                      tenantId,
                      projectId,
                      v.version_id,
                      token,
                      `${base}_${v.version}.csv`
                    );
                  } catch (err) {
                    setDownloadMsg(`Download failed: ${String((err as Error)?.message || err)}`);
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
                className="h-7 w-7 text-[color:var(--status-failed-fg)] hover:bg-[var(--status-failed-bg)]"
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
          <span className="inline-flex items-center gap-2">
            <DomainChip kind="readiness" />
            <span>{String(readinessQuery.data?.status || "pending")}</span>
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
                  ? `Open lineage for v${lineageVersionRow.version} (pinned dataset_version_id)`
                  : undefined
              }
            >
              {selectedVersionForReadiness ? (
                <Link href={`/lineage?datasetVersion=${encodeURIComponent(selectedVersionForReadiness)}`}>
                  <GitBranch className="h-3.5 w-3.5" />
                  {lineageVersionRow ? `Lineage (v${lineageVersionRow.version})` : "Lineage"}
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
                className="h-8 gap-1.5 border-[var(--status-failed-border)] bg-card text-xs text-[color:var(--status-failed-fg)]"
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
          <div className="rounded-xl border border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] px-4 py-3 text-sm text-[color:var(--status-failed-fg)]">
            Could not load dataset (check scope or id).
          </div>
        ) : null}

        {downloadMsg ? (
          <div className="rounded-xl border border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] px-4 py-3 text-sm text-[color:var(--status-failed-fg)]">
            {downloadMsg}
          </div>
        ) : null}

        {isTabLoading ? (
          <DetailTabSkeleton variant={DATASET_TAB_SKELETON[activeTab] ?? "grid"} />
        ) : (
        <>
        {activeTab === "overview" ? (
          <div className="grid min-w-0 max-w-[1400px] grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailSection title="Lifecycle layers" accentBorder="emerald">
              <div className="flex flex-wrap items-center gap-2">
                {lifecycleStages.map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px] font-medium",
                        i <= lifecycleStageIndex
                          ? "border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)] bg-[color:var(--status-success-bg)] dark:text-[color:var(--status-success-fg)]"
                          : "border-border text-muted-foreground/80"
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

            <DetailSection title="Dataset summary" accentBorder="emerald">
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
                    <p className="text-[color:var(--status-pending-fg)]/90">
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
                          c.status === "pass"
                            ? "border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)] dark:text-[color:var(--status-success-fg)]"
                            : "border-red-500/40 text-red-600 dark:text-[color:var(--status-failed-fg)]"
                        )}
                      >
                        {c.status === "pass" ? "PASS" : "FAIL"} · {c.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </DetailSection>

            {!scopePinned ? (
              <DetailSection
                title="Version retention"
                accentBorder="amber"
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
              accentBorder="violet"
              className="lg:col-span-2"
              description="Per policy vs pinned version — same scope as Readiness tab."
            >
              <div className="space-y-2 text-xs">
                {trainingEligibilityRows.length ? (
                  trainingEligibilityRows.map((r) => (
                    <div key={r.policyId} className="inset-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-foreground">{r.policyId}</span>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            r.eligible
                              ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]"
                              : "border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]"
                          }`}
                        >
                          {r.eligible ? "ELIGIBLE" : "BLOCKED"}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        mode={r.triggerMode} · current={r.currentSize} · required={r.requiredSize}
                        {r.modelId ? ` · model=${r.modelId}` : " · model=any"}
                      </div>
                      {!r.eligible && r.reasons.length ? (
                        <p className="mt-1 text-[color:var(--status-pending-fg)]/90">{r.reasons.join(" ; ")}</p>
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
        <DetailSection
          title="Readiness policy evaluation"
          accentBorder="sky"
          headerActions={<DomainChip kind="readiness" />}
        >
            <p className="mb-3 text-xs text-muted-foreground">
              Panel reflects <span className="font-mono text-foreground">GET …/readiness</span> (safe to poll). It does{" "}
              <span className="font-medium text-foreground">not</span> write audit history — use{" "}
              <span className="font-semibold text-foreground">Evaluate now</span>; the table under this card lists persisted
              evaluations.
            </p>
            {readinessLegacyFallback ? (
              <div className="mb-3 panel-surface bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">readiness_allow_legacy_fallback</span> — API may infer latest
                version if <code className="font-mono text-foreground">dataset_version_id</code> is omitted. Pin a version above
                for reproducible audits.
              </div>
            ) : null}
            <details className="mb-3 inset-surface px-3 py-2" open>
              <summary className="cursor-pointer select-none text-xs font-medium text-foreground hover:text-foreground/90">
                Version, policy & required size
              </summary>
              <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
                <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Version for readiness
                <SelectDropdown
                  value={selectedVersionId}
                  onChange={setSelectedVersionId}
                  options={readinessVersionSelectOptions}
                  className="mt-1"
                  buttonClassName="panel-surface bg-muted/20 px-3 py-2 text-sm"
                  disabled={readinessVersionSelectOptions.length === 0}
                  aria-label="Dataset version for readiness"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Policy
                <SelectDropdown
                  value={selectedPolicyId}
                  onChange={(id) => {
                    setSelectedPolicyId(id);
                    const picked = (policiesQuery.data?.items || []).find((p) => p.policy_id === id);
                    if (picked) setPolicyRequiredSizeDraft(String(picked.required_size || 1000));
                  }}
                  options={policySelectOptions}
                  className="mt-1"
                  buttonClassName="panel-surface bg-muted/20 px-3 py-2 text-sm"
                  disabled={policySelectOptions.length === 0}
                  aria-label="Training policy for readiness"
                />
              </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
              <SelectDropdown
                value={newPolicyTriggerMode}
                onChange={setNewPolicyTriggerMode}
                options={POLICY_TRIGGER_MODE_OPTIONS}
                className="w-40 shrink-0"
                buttonClassName="panel-surface bg-muted/20 px-2 py-2 text-xs"
                aria-label="Trigger mode for new policy"
              />
              <input
                type="number"
                min={1}
                value={policyRequiredSizeDraft}
                onChange={(e) => setPolicyRequiredSizeDraft(e.target.value)}
                className="w-48 appearance-none panel-surface bg-muted/20 px-2 py-2 text-xs text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={!selectedPolicyId}
                onClick={async () => applyPolicyRequiredSize(Number.parseInt(policyRequiredSizeDraft, 10) || 1)}
              >
                Confirm Policy
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1 text-xs"
                onClick={createPolicy}
              >
                Create Policy
              </Button>
              {policyMsg ? <span className="text-xs text-muted-foreground">{policyMsg}</span> : null}
                </div>
                <div>
                  <p className="mb-2 text-[11px] text-muted-foreground">Quick required_size presets</p>
                  <div className="flex flex-wrap gap-2">
              {policyPresets.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  disabled={!selectedPolicyId}
                  onClick={async () => applyPolicyRequiredSize(preset.requiredSize)}
                >
                  {preset.label} ({preset.requiredSize})
                </Button>
              ))}
                  </div>
                </div>
              </div>
            </details>
            {readinessQuery.data ? (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-foreground">
                  <DomainChip kind="readiness" />
                  <span className="text-muted-foreground">Status:</span>
                  <span
                    className={
                      readinessQuery.data.ready
                        ? "text-[color:var(--status-success-fg)]"
                        : "text-[color:var(--status-failed-fg)]"
                    }
                  >
                    {String(readinessQuery.data.eligibility_status || readinessQuery.data.status || "blocked")}
                  </span>
                </div>
                <div className="mb-3 grid gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    Current / required rows:{" "}
                    <span className="tabular-nums text-foreground">{readinessQuery.data.current_size}</span>
                    {" / "}
                    <span className="tabular-nums text-foreground">{readinessQuery.data.required_size}</span>
                  </div>
                  <div>
                    Ready:{" "}
                    <span className="font-medium text-foreground">{readinessQuery.data.ready ? "yes" : "no"}</span>
                  </div>
                  <div className="sm:col-span-2">
                    Policy{" "}
                    <span className="font-mono text-foreground">{readinessQuery.data.policy_id || "—"}</span>
                    {" · Version "}
                    <span className="font-mono text-foreground">{readinessQuery.data.dataset_version_id || "—"}</span>
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
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <DomainChip kind="eligibility" />
                      <span>Criteria</span>
                    </div>
                    {(readinessQuery.data.eligibility_criteria || []).map((c) => (
                      <div key={c.code} className="flex items-center justify-between inset-surface px-2 py-1 text-xs">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            c.status === "pass"
                              ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]"
                              : "border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]"
                          }`}
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
      ) : null}

      {activeTab === "accumulation" ? (
        <DetailSection title="Accumulation buffer" accentBorder="amber">
            {bufferQuery.isLoading && !bufferQuery.data ? (
              <p className="text-xs text-muted-foreground">Loading buffer…</p>
            ) : bufferQuery.data ? (
              <div className="space-y-3 text-xs text-muted-foreground">
                <p className="text-[11px] text-muted-foreground">
                  <span className="text-foreground">Materialization target</span> is separate from training policy{" "}
                  <span className="font-mono text-foreground">required_size</span> on the Readiness tab.
                </p>
                {accumulationStrategyDraft === "snapshot_on_schedule" && bufferMaterializationHints ? (
                  <div className="inset-surface px-3 py-2 text-[11px] text-muted-foreground">
                    Schedule mode: buffer{" "}
                    <span className="font-mono text-foreground">{bufferMaterializationHints.cur}</span>/
                    <span className="font-mono text-foreground">{bufferMaterializationHints.tgt}</span> — versions come from
                    project <span className="font-medium text-foreground">Run schedule tick</span> (below), not a wall-clock ETA.
                  </div>
                ) : null}
                {accumulationStrategyDraft === "rolling_accumulate" ? (
                  <div className="rounded-lg border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--status-pending-fg)]">
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
                  <p
                    className={`text-[11px] ${
                      accumulationMsg.includes("saved")
                        ? "text-[color:var(--status-success-fg)]/90"
                        : "text-[color:var(--status-pending-fg)]/90"
                    }`}
                  >
                    {accumulationMsg}
                  </p>
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
          accentBorder="sky"
          className="min-w-0"
          description="Immutable snapshots. Edit tags/refs from the table when your role allows."
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
              <MlopsDataTable
                columns={versionColumns}
                data={versionsQuery.data?.items || []}
                keyExtractor={(v) => v.version_id}
                emptyMessage="No versions yet."
                className="text-sm"
              />
            )}
        </DetailSection>
      ) : null}

      {activeTab === "training" ? (
        <DetailSection title="Run / Train" accentBorder="violet" className="min-w-0">
          <ExecutionIntentPanel
            datasetId={datasetId}
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            scopePinned={scopePinned}
            versions={versionsQuery.data?.items || []}
            versionsLoading={versionsQuery.isLoading}
          />
        </DetailSection>
      ) : null}

      {activeTab === "readiness" ? (
        <DetailSection
          title="Readiness evaluations"
          className="min-w-0"
          accentBorder="emerald"
          description="Rows are written only when you use Evaluate now — not when polling GET …/readiness."
          headerActions={
            <FilterChips
              variant="emerald"
              options={[
                { id: "all", label: "All" },
                { id: "eligible", label: "Eligible" },
                { id: "blocked", label: "Blocked" },
              ]}
              value={evaluationStatusFilter}
              onChange={(id) => {
                setEvaluationStatusFilter(id);
                setEvaluationCurrentPage(1);
              }}
            />
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {(evaluationCurrentPage - 1) * READINESS_EVALUATIONS_PAGE_SIZE + 1}-
              {Math.min(evaluationCurrentPage * READINESS_EVALUATIONS_PAGE_SIZE, filteredEvaluations.length)} of{" "}
              {filteredEvaluations.length} evaluations
            </span>
            <div className="flex items-center gap-2">
              <SelectDropdown
                value={evaluationSourceFilter}
                onChange={(v) => {
                  setEvaluationSourceFilter(v);
                  setEvaluationCurrentPage(1);
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
                  setEvaluationCurrentPage(1);
                }}
                options={evaluationPolicyFilterOptions}
                buttonClassName="panel-surface px-2 py-1 text-xs"
                className="min-w-[10rem]"
                aria-label="Filter evaluations by policy"
              />
              <Button
                variant="secondary"
                onClick={() => setEvaluationCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={evaluationCurrentPage === 1 || readinessEvaluationsQuery.isLoading}
              >
                {"<<"}
              </Button>
              <span className="px-3 text-sm text-foreground">
                Page {evaluationCurrentPage} / {evaluationTotalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  setEvaluationCurrentPage((prev) => Math.min(evaluationTotalPages, prev + 1))
                }
                disabled={evaluationCurrentPage === evaluationTotalPages || readinessEvaluationsQuery.isLoading}
              >
                {">>"}
              </Button>
            </div>
          </div>
          {readinessEvaluationsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : paginatedEvaluations.length === 0 ? (
            <MlopsEmptyState
              icon={Database}
              title={
                allEvaluationItems.length === 0
                  ? "No readiness evaluations yet"
                  : "No evaluations match filters"
              }
              description={
                allEvaluationItems.length === 0
                  ? "Run evaluate from the Readiness tab controls above."
                  : "Try a different status, source, or policy filter."
              }
            />
          ) : (
            <MlopsDataTable
              columns={evaluationColumns}
              data={paginatedEvaluations}
              keyExtractor={(row) => row.evaluation_id}
              emptyMessage="No evaluations on this page."
              className="text-sm"
            />
          )}
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
          className="flex h-[min(92vh,56rem)] w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]"
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
              <span className="font-mono text-foreground">v{versionEditorLabel}</span>
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
              <div className="mt-2 shrink-0 rounded-md border border-[var(--status-failed-border)] bg-[var(--status-failed-bg)] px-2 py-1.5 text-xs text-[color:var(--status-failed-fg)]">
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
              Append-only merge for <span className="font-mono text-foreground">v{versionMetaLabel}</span> (
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
              <div className="rounded-md border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] px-2 py-1.5 text-xs text-[color:var(--status-pending-fg)]">
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
            <p className="text-xs text-[color:var(--status-failed-fg)]">{deleteMsg}</p>
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
            <p className="text-xs text-[color:var(--status-failed-fg)]">{deleteMsg}</p>
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
