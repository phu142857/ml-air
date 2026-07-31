"use client";

import { Box, FolderUp, Play } from "lucide-react";
import {
  DetailSection,
  DetailTabList,
  FilterChips,
  MetadataGrid,
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
  pageHeaderActionClass,
  tabPanelScrollClassName,
} from "@/components/mlops/layout";
import { Tabs, TabsContent } from "@/components/ui/tabs";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DetailTabSkeleton } from "@/components/mlops/detail-tab-skeleton";
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table";
import type { ModelVersionItem } from "@/lib/api";
import { StatusBadge } from "@/components/mlops/status-badge";
import { useTabLoading } from "@/hooks/use-tab-loading";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  deleteModel,
  deleteModelVersion,
  fetchDatasets,
  fetchDatasetVersions,
  fetchModels,
  fetchModelServing,
  fetchModelStatus,
  fetchModelTriggerPolicy,
  fetchModelVersions,
  fetchPromotionEligibility,
  fetchRun,
  promoteModelVersion,
  setModelServingSlot,
  updateModelVersionApproval,
  updateModelTriggerPolicy
} from "@/lib/api";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_MODEL_DETAIL } from "@/lib/scope-messages";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import {
  canPromoteVersionToStage,
  canRollbackVersionToStage,
  modelApprovalDisplayLabel,
  modelApprovalPillClass,
  modelStageIndicator,
  modelStagePillClass,
  nextPromotionStage,
  previousPromotionStage,
  promotionBlockMessage,
  transitionKind,
  type PromotionGovernanceFeatures,
} from "@/lib/model-governance-ui";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { formatVersionLabel } from "@/lib/version-label";
import { toastError, toastSuccess } from "@/lib/toast-actions";
import { useServingSlotsHttpFeature } from "@/lib/use-serving-slots-http-feature";
import { ImportModelDialog } from "@/components/mlops/import-model-dialog";
import { ModelPipelineMappingCard } from "@/components/mlops/model-pipeline-mapping-card";
import { ModelProvenancePanel } from "@/components/mlops/model-provenance-panel";
import {
  ModelApprovalHistory,
  ModelStageTimeline,
  ModelVersionComparePanel,
} from "@/components/mlops/model-governance-panels";

const SERVING_SLOTS = ["champion", "candidate", "challenger", "canary"] as const;

const MODEL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "policy", label: "Trigger policy" },
  { id: "versions", label: "Versions" },
  { id: "runs", label: "Recent runs" },
] as const;

const MODEL_TAB_SKELETON: Record<string, "grid" | "table"> = {
  overview: "grid",
  policy: "grid",
  versions: "table",
  runs: "table",
};

const VERSIONS_PAGE_SIZE = 20;

function runStatusForBadge(status: string) {
  const s = String(status || "").toLowerCase();
  if (s.includes("success") || s.includes("complete")) return <StatusBadge status="success" label={status} size="sm" />;
  if (s.includes("fail") || s.includes("error")) return <StatusBadge status="failed" label={status} size="sm" />;
  if (s.includes("run")) return <StatusBadge status="running" label={status} size="sm" />;
  return <StatusBadge status="pending" label={status} size="sm" />;
}

export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const modelId = params.modelId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const servingSlotsUi = useServingSlotsHttpFeature();
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const [stageFilter, setStageFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [triggerMode, setTriggerMode] = useState<"manual" | "auto_ready" | "schedule">("manual");
  const [debounceMinutes, setDebounceMinutes] = useState("10");
  const [scheduleCron, setScheduleCron] = useState("0 */6 * * *");
  const [triggerDatasetId, setTriggerDatasetId] = useState("");
  const [triggerDatasetVersionId, setTriggerDatasetVersionId] = useState("");
  const [policyMsg, setPolicyMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmBody, setConfirmBody] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);
  const [versionBanner, setVersionBanner] = useState("");
  const [servingSlotDraft, setServingSlotDraft] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("overview");
  const [importVersionOpen, setImportVersionOpen] = useState(false);
  const isTabLoading = useTabLoading(tab);
  const [promotionFeatures, setPromotionFeatures] = useState<PromotionGovernanceFeatures | null>(
    () => getRuntimeConfig()?.features ?? null
  );

  useEffect(() => {
    const sync = () => setPromotionFeatures(getRuntimeConfig()?.features ?? null);
    sync();
    window.addEventListener("mlair-runtime-config-updated", sync);
    return () => window.removeEventListener("mlair-runtime-config-updated", sync);
  }, []);

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });
  const versionsQuery = useQuery({
    queryKey: mlairKeys.models.versions(tenantId, projectId, modelId),
    queryFn: () => fetchModelVersions(tenantId, projectId, modelId, token),
    ...realtimeFallbackPolling()
  });
  const modelStatusQuery = useQuery({
    queryKey: mlairKeys.models.status(tenantId, projectId, modelId),
    queryFn: () => fetchModelStatus(tenantId, projectId, modelId, token),
    ...realtimeFallbackPolling()
  });
  const recentRunsQuery = useQuery({
    queryKey: mlairKeys.models.recentRuns(
      tenantId,
      projectId,
      modelId,
      (versionsQuery.data?.items || []).map((v) => v.run_id).join(",")
    ),
    queryFn: async () => {
      const ids = (versionsQuery.data?.items || [])
        .map((v) => String(v.run_id || "").trim())
        .filter(Boolean)
        .slice(0, 5);
      const rows = await Promise.all(ids.map((id) => fetchRun(tenantId, projectId, id, token).catch(() => null)));
      return rows.filter(Boolean) as Array<any>;
    },
    enabled: !!versionsQuery.data?.items?.length,
    ...realtimeFallbackPolling()
  });

  const triggerPolicyQuery = useQuery({
    queryKey: mlairKeys.models.triggerPolicy(tenantId, projectId, modelId),
    queryFn: () => fetchModelTriggerPolicy(tenantId, projectId, modelId, token),
    ...realtimeFallbackPolling()
  });

  useEffect(() => {
    if (!triggerPolicyQuery.data) return;
    setTriggerMode(triggerPolicyQuery.data.trigger_mode);
    setDebounceMinutes(String(triggerPolicyQuery.data.debounce_minutes || 10));
    setScheduleCron(triggerPolicyQuery.data.schedule_cron || "0 */6 * * *");
    setTriggerDatasetId(triggerPolicyQuery.data.dataset_id || "");
    setTriggerDatasetVersionId(triggerPolicyQuery.data.dataset_version_id || "");
  }, [triggerPolicyQuery.data]);

  const triggerDatasetsQuery = useQuery({
    queryKey: ["model-trigger-datasets", tenantId, projectId],
    queryFn: () => fetchDatasets(tenantId, projectId, token),
    enabled: Boolean(token && scopePinned && tab === "policy"),
    staleTime: 60_000,
  });

  const triggerVersionsQuery = useQuery({
    queryKey: ["model-trigger-dataset-versions", tenantId, projectId, triggerDatasetId],
    queryFn: () => fetchDatasetVersions(tenantId, projectId, triggerDatasetId, token),
    enabled: Boolean(token && scopePinned && triggerDatasetId),
    staleTime: 30_000,
  });

  const triggerDatasetOptions = useMemo(() => {
    const items = triggerDatasetsQuery.data?.items ?? [];
    return [
      { value: "", label: "No dataset pin (legacy)" },
      ...items.map((d) => ({
        value: d.dataset_id,
        label: d.name ? `${d.name} (${d.dataset_id.slice(0, 8)}…)` : d.dataset_id,
      })),
    ];
  }, [triggerDatasetsQuery.data?.items]);

  const triggerVersionOptions = useMemo(() => {
    const items = triggerVersionsQuery.data?.items ?? [];
    return [
      { value: "", label: "Select version" },
      ...items.map((v) => ({
        value: v.version_id,
        label: `${formatVersionLabel(v.version)} · ${v.version_id.slice(0, 8)}…`,
      })),
    ];
  }, [triggerVersionsQuery.data?.items]);

  useEffect(() => {
    setServingSlotDraft({});
    setVersionBanner("");
  }, [modelId]);

  const model = useMemo(() => modelsQuery.data?.items.find((x) => x.model_id === modelId) ?? null, [modelsQuery.data, modelId]);

  const allVersions = versionsQuery.data?.items ?? [];
  const productionVersion = useMemo(() => {
    if (model?.production_version != null) return model.production_version;
    return allVersions.find((v) => v.stage === "production")?.version ?? null;
  }, [model?.production_version, allVersions]);
  const filteredVersions = useMemo(() => {
    if (stageFilter === "all") return allVersions;
    return allVersions.filter((v) => v.stage === stageFilter);
  }, [allVersions, stageFilter]);
  const servingVersionOptions = useMemo(
    () => [
      { value: "", label: "Select version" },
      ...allVersions.map((v) => ({
        value: String(v.version),
        label: `${formatVersionLabel(v.version)}${v.stage ? ` · ${v.stage}` : ""}${v.approval_status ? ` · ${v.approval_status}` : ""}`,
      })),
    ],
    [allVersions],
  );
  const totalPages = Math.max(1, Math.ceil(filteredVersions.length / VERSIONS_PAGE_SIZE));
  const paginatedVersions = useMemo(
    () =>
      filteredVersions.slice(
        (currentPage - 1) * VERSIONS_PAGE_SIZE,
        currentPage * VERSIONS_PAGE_SIZE
      ),
    [filteredVersions, currentPage]
  );
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const promoteMutation = useMutation({
    mutationFn: ({ version, stage }: { version: number; stage: string }) =>
      promoteModelVersion(tenantId, projectId, modelId, token, { version, stage }),
    onSuccess: async (_data, { version, stage }) => {
      setVersionBanner("");
      toastSuccess(`Promoted to ${stage}`, `Version ${formatVersionLabel(version)}`);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => {
      const msg = formatApiClientError(e);
      setVersionBanner(msg);
      toastError("Promotion failed", msg);
    }
  });

  const servingQuery = useQuery({
    queryKey: mlairKeys.models.serving(tenantId, projectId, modelId),
    queryFn: () => fetchModelServing(tenantId, projectId, modelId, token),
    enabled: servingSlotsUi && Boolean(modelId && token && projectId !== "all"),
    ...realtimeFallbackPolling()
  });

  const approvalMutation = useMutation({
    mutationFn: (p: { version: number; approval_status: "approved" | "rejected" }) =>
      updateModelVersionApproval(tenantId, projectId, modelId, p.version, token, {
        approval_status: p.approval_status,
        reason: p.approval_status === "rejected" ? "rejected via UI" : null
      }),
    onSuccess: async (_data, { version, approval_status }) => {
      setVersionBanner("");
      toastSuccess(
        approval_status === "approved" ? "Version approved" : "Version rejected",
        formatVersionLabel(version),
      );
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => {
      const msg = formatApiClientError(e);
      setVersionBanner(msg);
      toastError("Approval update failed", msg);
    }
  });

  const servingAssignMutation = useMutation({
    mutationFn: (p: { slot: string; version: number }) =>
      setModelServingSlot(tenantId, projectId, modelId, p.slot, token, { version: p.version }),
    onSuccess: async (_data, { slot, version }) => {
      setVersionBanner("");
      toastSuccess("Serving slot updated", `${slot} → ${formatVersionLabel(version)}`);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.serving(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => {
      const msg = formatApiClientError(e);
      setVersionBanner(msg);
      toastError("Serving update failed", msg);
    }
  });
  const triggerPolicyMutation = useMutation({
    mutationFn: () =>
      updateModelTriggerPolicy(tenantId, projectId, modelId, token, {
        trigger_mode: triggerMode,
        debounce_minutes: Math.max(1, Number.parseInt(debounceMinutes || "10", 10) || 10),
        schedule_cron: scheduleCron.trim() || "0 */6 * * *",
        dataset_id: triggerDatasetId.trim() || null,
        dataset_version_id: triggerDatasetVersionId.trim() || null,
        training_policy_id: null,
      }),
    onSuccess: async (saved) => {
      setPolicyMsg("");
      toastSuccess("Trigger policy saved");
      setTriggerMode(saved.trigger_mode);
      setDebounceMinutes(String(saved.debounce_minutes || 10));
      setScheduleCron(saved.schedule_cron || "0 */6 * * *");
      setTriggerDatasetId(saved.dataset_id || "");
      setTriggerDatasetVersionId(saved.dataset_version_id || "");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.triggerPolicy(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => {
      const msg = formatApiClientError(e);
      setPolicyMsg(`Save failed: ${msg}`);
      toastError("Save failed", msg);
    }
  });
  const deleteModelMutation = useMutation({
    mutationFn: () => deleteModel(tenantId, projectId, modelId, token),
    onSuccess: async () => {
      toastSuccess("Model deleted", modelId);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId) });
      router.push("/models");
    },
    onError: (e: unknown) => toastError("Delete failed", formatApiClientError(e)),
  });
  const deleteVersionMutation = useMutation({
    mutationFn: (version: number) => deleteModelVersion(tenantId, projectId, modelId, version, token),
    onSuccess: async (_data, version) => {
      toastSuccess("Version deleted", formatVersionLabel(version));
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, modelId) });
    },
    onError: (e: unknown) => toastError("Delete failed", formatApiClientError(e)),
  });
 
  const openConfirm = (title: string, body: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const requestPromote = useCallback(
    async (version: number, stage: string, row: ModelVersionItem) => {
      if (projectId === "all" || !token) return;
      const kind = transitionKind(row.stage, stage, promotionFeatures);
      const allowed =
        kind === "rollback"
          ? canRollbackVersionToStage(row, stage, promotionFeatures)
          : canPromoteVersionToStage(row, stage, promotionFeatures);
      if (!allowed) {
        setVersionBanner(promotionBlockMessage(row, stage, promotionFeatures));
        return;
      }
      try {
        const elig = await fetchPromotionEligibility(tenantId, projectId, modelId, version, token, stage);
        if (!elig.eligible) {
          setVersionBanner(elig.reasons.map((r) => r.message).join(" · "));
          return;
        }
        promoteMutation.mutate({ version, stage });
      } catch (e: unknown) {
        setVersionBanner(formatApiClientError(e));
      }
    },
    [tenantId, projectId, modelId, token, promotionFeatures, promoteMutation]
  );

  const effectiveTriggerMode = triggerPolicyQuery.data?.trigger_mode || triggerMode;
  const effectiveDebounce = triggerPolicyQuery.data?.debounce_minutes ?? Math.max(1, Number.parseInt(debounceMinutes || "10", 10) || 10);
  const effectiveCron = triggerPolicyQuery.data?.schedule_cron || scheduleCron || "0 */6 * * *";

  const versionColumns: DataTableColumn<ModelVersionItem>[] = useMemo(
    () => [
      {
        id: "version",
        header: "Version",
        width: 120,
        canHide: false,
        getSearchValue: (v) => formatVersionLabel(v.version),
        getSortValue: (v) => v.version,
        cell: (v) => <span className="font-mono text-sm">{formatVersionLabel(v.version)}</span>,
      },
      {
        id: "stage",
        header: "Stage",
        width: 140,
        getSortValue: (v) => (v.stage || "").toLowerCase(),
        getFilterValue: (v) => (v.stage || "").toLowerCase(),
        filterOptions: [
          { label: "Dev", value: "dev" },
          { label: "Staging", value: "staging" },
          { label: "Production", value: "production" },
          { label: "Archived", value: "archived" },
        ],
        cell: (v) => (
          <span className={modelStagePillClass(v.stage)}>
            {modelStageIndicator(v.stage)} {v.stage}
          </span>
        ),
      },
      {
        id: "approval",
        header: "Approval",
        width: 180,
        getSortValue: (v) => v.approval_status || "",
        getFilterValue: (v) => v.approval_status || "none",
        filterOptions: [
          { label: "Approved", value: "approved" },
          { label: "Rejected", value: "rejected" },
          { label: "Pending", value: "pending_manual_approval" },
          { label: "None", value: "none" },
        ],
        getSearchValue: (v) =>
          `${v.approval_status || ""} ${modelApprovalDisplayLabel(v.approval_status) || ""}`,
        cell: (v) => {
          const status = v.approval_status;
          if (status === "pending_manual_approval" && projectId !== "all") {
            return (
              <div className="flex flex-nowrap gap-1">
                <button
                  type="button"
                  className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  disabled={approvalMutation.isPending}
                  onClick={() => approvalMutation.mutate({ version: v.version, approval_status: "approved" })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                  disabled={approvalMutation.isPending}
                  onClick={() => approvalMutation.mutate({ version: v.version, approval_status: "rejected" })}
                >
                  Reject
                </button>
              </div>
            );
          }
          const label = modelApprovalDisplayLabel(status);
          if (!label) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <span className={modelApprovalPillClass(status)} title={v.approval_reason || undefined}>
              {label}
            </span>
          );
        },
      },
      {
        id: "run",
        header: "Run",
        width: 220,
        getSearchValue: (v) => v.run_id || "",
        getSortValue: (v) => v.run_id || "",
        cell: (v) =>
          v.run_id ? (
            <Link
              href={`/runs/${encodeURIComponent(v.run_id)}`}
              className="inline-block max-w-full truncate font-mono text-xs text-primary hover:text-primary/80"
              onClick={(e) => e.stopPropagation()}
            >
              {v.run_id}
            </Link>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        width: 280,
        canHide: false,
        cell: (v) => {
          const promoteTarget = nextPromotionStage(v.stage, promotionFeatures);
          const rollbackTarget = previousPromotionStage(v.stage, promotionFeatures);
          const canPromote = promoteTarget
            ? canPromoteVersionToStage(v, promoteTarget, promotionFeatures)
            : false;
          const canRollback = rollbackTarget
            ? canRollbackVersionToStage(v, rollbackTarget, promotionFeatures)
            : false;
          return (
          <div className="flex flex-wrap justify-start gap-2">
            {promoteTarget ? (
            <button
              type="button"
              onClick={() => void requestPromote(v.version, promoteTarget, v)}
              className="action-btn-sm btn-action-promote rounded-lg px-2 py-1 text-xs disabled:opacity-60"
              disabled={promoteMutation.isPending || !canPromote}
              title={
                !canPromote ? promotionBlockMessage(v, promoteTarget, promotionFeatures) : undefined
              }
            >
              Promote{promoteTarget !== "production" ? ` → ${promoteTarget}` : ""}
            </button>
            ) : null}
            {rollbackTarget ? (
            <button
              type="button"
              onClick={() => void requestPromote(v.version, rollbackTarget, v)}
              className="action-btn-md btn-action-rollback rounded-lg px-2 py-1 text-xs disabled:opacity-60"
              disabled={promoteMutation.isPending || !canRollback}
              title={
                !canRollback ? promotionBlockMessage(v, rollbackTarget, promotionFeatures) : undefined
              }
            >
              Rollback → {rollbackTarget}
            </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                openConfirm(
                  "Delete version",
                  `Delete version ${formatVersionLabel(v.version)} of model "${model?.name || modelId}"?`,
                  async () => {
                    await deleteVersionMutation.mutateAsync(v.version);
                    setConfirmOpen(false);
                  },
                )
              }
              className="action-btn-xs btn-action-delete rounded-lg px-2 py-1 text-xs disabled:opacity-60"
              disabled={deleteVersionMutation.isPending}
            >
              Delete
            </button>
          </div>
          );
        },
      },
    ],
    [
      projectId,
      modelId,
      model?.name,
      approvalMutation,
      promoteMutation,
      deleteVersionMutation,
      openConfirm,
      promotionFeatures,
      requestPromote,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/70 bg-background/60 overflow-hidden">
        <SubpageBreadcrumb
          segments={[
            { label: "Models", href: "/models" },
            { label: model?.name ?? modelId, mono: true },
          ]}
        />
        <ResourcePageHeader
          icon={Box}
          accent="violet"
          title={`Model · ${model?.name ?? modelId}`}
          className="border-b-0"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className={pageHeaderActionClass}
                onClick={() => router.push("/models")}
              >
                All models
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  openConfirm(
                    "Delete model",
                    `Delete model "${model?.name || modelId}" and all of its versions?`,
                    async () => {
                      await deleteModelMutation.mutateAsync();
                      setConfirmOpen(false);
                    }
                  )
                }
                disabled={deleteModelMutation.isPending}
              >
                Delete model
              </Button>
            </div>
          }
        />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <DetailTabList accent="violet" tabs={[...MODEL_TABS]} />
        {!scopePinned ? (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <ScopePinnedInline message={SCOPE_AGGREGATE_MODEL_DETAIL} />
          </div>
        ) : null}

        <TabsContent value="overview" className={tabPanelScrollClassName("space-y-6")}>
        {isTabLoading && tab === "overview" ? (
          <DetailTabSkeleton variant={MODEL_TAB_SKELETON.overview} />
        ) : (
        <>
      <DetailSection title="Registry status" accentBorder="violet">
          <MetadataGrid
            columns={2}
            items={[
              {
                label: "Status",
                value: (
                  <span
                    className={
                      modelStatusQuery.data?.status === "READY"
                        ? "text-[color:var(--status-success-fg)]"
                        : "text-[color:var(--status-pending-fg)]"
                    }
                  >
                    {modelStatusQuery.data?.status || "UNKNOWN"}
                  </span>
                ),
              },
              {
                label: "Model ID",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    <span className="font-mono text-xs">{modelId}</span>
                    {productionVersion != null ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        prod {formatVersionLabel(productionVersion)}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              { label: "Name", value: model?.name ?? "—" },
              { label: "Description", value: model?.description ?? "—" },
            ]}
          />
          {scopePinned ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ModelPipelineMappingCard
                tenantId={tenantId}
                projectId={projectId}
                modelId={modelId}
                token={token}
              />
              <ModelProvenancePanel
                tenantId={tenantId}
                projectId={projectId}
                modelId={modelId}
                token={token}
                version={productionVersion}
              />
            </div>
          ) : null}
          {scopePinned && versionsQuery.data?.items?.length ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Stage transition timeline</h3>
                <ModelStageTimeline
                  tenantId={tenantId}
                  projectId={projectId}
                  modelId={modelId}
                  token={token}
                  versions={versionsQuery.data.items}
                />
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Approval history</h3>
                <ModelApprovalHistory
                  tenantId={tenantId}
                  projectId={projectId}
                  modelId={modelId}
                  token={token}
                  versions={versionsQuery.data.items}
                />
              </div>
            </div>
          ) : null}
      </DetailSection>
        {projectId !== "all" && servingSlotsUi ? (
      <DetailSection title="Serving slots" accentBorder="violet">
            <div className="grid gap-2 md:grid-cols-2">
              {SERVING_SLOTS.map((slot) => {
                const cur = servingQuery.data?.slots?.[slot];
                return (
                  <div
                    key={slot}
                    className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-2 text-xs"
                  >
                    <span className="font-medium capitalize text-foreground">{slot}</span>
                    <span className="text-muted-foreground">{cur ? formatVersionLabel(cur.version) : "—"}</span>
                    <SelectDropdown
                      value={servingSlotDraft[slot] ?? ""}
                      onChange={(value) => setServingSlotDraft((prev) => ({ ...prev, [slot]: value }))}
                      options={servingVersionOptions}
                      className="min-w-[180px]"
                      buttonClassName="h-8 min-w-[180px] bg-muted px-2 py-1 text-xs"
                      aria-label={`${slot} serving slot version`}
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/40 disabled:opacity-60"
                      disabled={servingAssignMutation.isPending}
                      onClick={() => {
                        const n = Number.parseInt(String(servingSlotDraft[slot] || "").trim(), 10);
                        if (!Number.isFinite(n) || n < 1) return;
                        servingAssignMutation.mutate({ slot, version: n });
                      }}
                    >
                      Set
                    </button>
                  </div>
                );
              })}
            </div>
      </DetailSection>
        ) : null}
        </>
        )}
        </TabsContent>

        <TabsContent value="policy" className={tabPanelScrollClassName("space-y-6")}>
        {isTabLoading && tab === "policy" ? (
          <DetailTabSkeleton variant={MODEL_TAB_SKELETON.policy} />
        ) : (
      <DetailSection title="Trigger policy" accentBorder="violet">
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
          <h3 className="mb-2 text-xs font-semibold text-foreground">Auto Trigger Config</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "manual"}
                onChange={() => setTriggerMode("manual")}
              />
              Manual
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "auto_ready"}
                onChange={() => setTriggerMode("auto_ready")}
              />
              Auto when READY
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="trigger-mode"
                checked={triggerMode === "schedule"}
                onChange={() => setTriggerMode("schedule")}
              />
              Schedule (cron)
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {triggerMode !== "manual" ? (
              <label className="text-xs text-muted-foreground">
                Debounce (minutes)
                <input
                  value={debounceMinutes}
                  onChange={(e) => setDebounceMinutes(e.target.value)}
                  className="mt-1 w-full inset-surface px-2 py-2 text-xs text-foreground"
                />
              </label>
            ) : null}
            {triggerMode === "schedule" ? (
              <label className="text-xs text-muted-foreground">
                Cron
                <input
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="mt-1 w-full inset-surface px-2 py-2 text-xs text-foreground"
                />
              </label>
            ) : null}
          </div>
          {triggerMode !== "manual" ? (
          <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
            <p className="text-xs font-semibold text-foreground">Data anchor (auto-trigger)</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Dataset
                <SelectDropdown
                  value={triggerDatasetId}
                  onChange={(next) => {
                    setTriggerDatasetId(next);
                    setTriggerDatasetVersionId("");
                  }}
                  options={triggerDatasetOptions}
                  className="mt-1"
                  buttonClassName="inset-surface px-2 py-2 text-xs"
                  disabled={!scopePinned || triggerDatasetsQuery.isLoading}
                  aria-label="Trigger policy dataset"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Dataset version
                <SelectDropdown
                  value={triggerDatasetVersionId}
                  onChange={setTriggerDatasetVersionId}
                  options={triggerVersionOptions}
                  className="mt-1"
                  buttonClassName="inset-surface px-2 py-2 text-xs"
                  disabled={!triggerDatasetId || triggerVersionsQuery.isLoading}
                  aria-label="Trigger policy dataset version"
                />
              </label>
            </div>
          </div>
          ) : null}
          <div className="mt-2 text-xs text-muted-foreground">
            Applied mode: <span className="text-foreground">{effectiveTriggerMode}</span> · debounce:{" "}
            <span className="text-foreground">{effectiveDebounce}m</span>
            {effectiveTriggerMode === "schedule" ? (
              <>
                {" · "}cron: <span className="text-foreground">{effectiveCron}</span>
              </>
            ) : null}
          </div>
          {triggerPolicyQuery.data?.last_trigger_attempt_at ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Last auto-trigger:{" "}
              <span className="text-foreground">
                {formatDateTimeCompact(triggerPolicyQuery.data.last_trigger_attempt_at)}
              </span>
              {" · "}
              <span className="text-foreground">{triggerPolicyQuery.data.last_trigger_outcome || "—"}</span>
              {triggerPolicyQuery.data.last_skip_reason ? (
                <>
                  {" · "}skip: <span className="text-foreground">{triggerPolicyQuery.data.last_skip_reason}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <Button
              className="rounded-lg px-3 py-1 text-xs"
              onClick={() => triggerPolicyMutation.mutate()}
              disabled={triggerPolicyMutation.isPending}
            >
              Save Trigger Policy
            </Button>
            {policyMsg ? <span className="text-xs text-foreground">{policyMsg}</span> : null}
          </div>
        </div>
      </DetailSection>
        )}
        </TabsContent>

        <TabsContent value="runs" className={tabPanelScrollClassName("space-y-6")}>
        {isTabLoading && tab === "runs" ? (
          <DetailTabSkeleton variant={MODEL_TAB_SKELETON.runs} />
        ) : (
      <DetailSection title="Recent runs" accentBorder="violet">
        {!(recentRunsQuery.data || []).length ? (
          <MlopsEmptyState icon={Play} title="No recent runs" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {(recentRunsQuery.data || []).map((r) => (
              <li key={r.run_id} className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2.5">
                <Link href={`/runs/${encodeURIComponent(r.run_id)}`} className="font-mono text-xs text-primary hover:text-primary/80">
                  {r.run_id}
                </Link>
                <div className="flex items-center gap-2">
                  {runStatusForBadge(r.status)}
                  <span className="text-xs text-muted-foreground">{formatDateTimeCompact(r.updated_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
        )}
        </TabsContent>

        <TabsContent value="versions" className={tabPanelScrollClassName("space-y-6")}>
        {isTabLoading && tab === "versions" ? (
          <DetailTabSkeleton variant={MODEL_TAB_SKELETON.versions} />
        ) : (
      <DetailSection
        title="Versions"
        accentBorder="violet"
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-white disabled:text-white/90"
              disabled={!scopePinned}
              onClick={() => setImportVersionOpen(true)}
            >
              <FolderUp className="h-3.5 w-3.5" />
              Import from local
            </Button>
            <FilterChips
              variant="violet"
              options={[
                { id: "all", label: "All" },
                { id: "production", label: "Production" },
                { id: "staging", label: "Staging" },
                { id: "archived", label: "Archived" },
              ]}
              value={stageFilter}
              onChange={(id) => {
                setStageFilter(id);
                setCurrentPage(1);
              }}
            />
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {versionBanner ? (
              <span className="version-inline-banner">{versionBanner}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {filteredVersions.length === 0 ? 0 : (currentPage - 1) * VERSIONS_PAGE_SIZE + 1}-
              {Math.min(currentPage * VERSIONS_PAGE_SIZE, filteredVersions.length)} of{" "}
              {filteredVersions.length} versions
            </span>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || versionsQuery.isLoading}
            >
              {"<<"}
            </Button>
            <span className="px-3 text-sm text-foreground">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || versionsQuery.isLoading}
            >
              {">>"}
            </Button>
          </div>
        </div>
        {paginatedVersions.length === 0 ? (
          <MlopsEmptyState
            icon={Box}
            title="No versions for this filter"
          />
        ) : (
          <>
          {scopePinned ? (
            <div className="mb-4">
              <ModelVersionComparePanel
                tenantId={tenantId}
                projectId={projectId}
                modelId={modelId}
                token={token}
                versions={filteredVersions}
              />
            </div>
          ) : null}
          <MlopsDataTable
            tableId="model-versions"
            columns={versionColumns}
            data={paginatedVersions}
            keyExtractor={(v) => v.version_id}
            emptyMessage="No versions for current filter."
          />
          </>
        )}
      </DetailSection>
        )}
        </TabsContent>
      </Tabs>
      <ImportModelDialog
        open={importVersionOpen}
        onOpenChange={setImportVersionOpen}
        existingModelId={modelId}
        existingModelName={model?.name}
        onSuccess={() => {
          setVersionBanner("Version imported from local files.");
          setTab("versions");
        }}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={confirmTitle}
        body={confirmBody}
        onCancel={() => setConfirmOpen(false)}
        onDelete={() => {
          if (confirmAction) void confirmAction();
        }}
        isLoading={deleteModelMutation.isPending || deleteVersionMutation.isPending}
      />
    </div>
  );
}
