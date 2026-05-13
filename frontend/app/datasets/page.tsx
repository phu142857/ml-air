"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import {
  type DatasetVersionItem,
  deleteDataset,
  deleteDatasetVersion,
  fetchDatasets,
  fetchDatasetVersions,
  fetchModelResolvedPipeline,
  fetchModels,
  fetchModelVersions,
  fetchPipelines,
  fetchPipelineVersions,
  previewDatasetUpload,
  normalizeProjectId,
  triggerRunFromModelDataset,
  uploadDatasetCsv
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import { datasetStatusBadgeClass, normalizeDatasetStatus } from "@/lib/status-style";
import { formatDateTimeCompact } from "@/lib/utils";

const TRAINING_MODE_OPTIONS = [
  { value: "quick", label: "Quick" },
  { value: "standard", label: "Standard" },
  { value: "full", label: "Full" }
];

function describeRunBlockError(err: unknown): string {
  const fallback = String((err as any)?.message || err || "Unknown error");
  try {
    const parsed = JSON.parse(fallback);
    const detail = parsed?.detail;
    if (detail?.status === "BLOCKED") {
      const reason = String(detail?.reason || "BLOCKED");
      const details = String(detail?.details || "");
      return details ? `Train blocked (${reason}): ${details}` : `Train blocked (${reason})`;
    }
    if (typeof detail === "string" && detail.trim()) return `Train failed: ${detail}`;
  } catch {
    // Keep fallback message
  }
  return `Train failed: ${fallback}`;
}

export default function DatasetsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [datasetName, setDatasetName] = useState("");
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [trainingMode, setTrainingMode] = useState("standard");
  const [datasetMsg, setDatasetMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmBody, setConfirmBody] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVersion, setDetailVersion] = useState<DatasetVersionItem | null>(null);

  const datasetsQuery = useQuery({
    queryKey: mlairKeys.datasets.list(tenantId, projectId),
    queryFn: () => fetchDatasets(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });
  const selectedDataset = useMemo(
    () => (datasetsQuery.data?.items || []).find((d) => d.dataset_id === selectedDatasetId) || null,
    [datasetsQuery.data, selectedDatasetId]
  );
  const versionsQuery = useQuery({
    queryKey: mlairKeys.datasets.versions(tenantId, projectId, selectedDatasetId),
    queryFn: () => fetchDatasetVersions(tenantId, projectId, selectedDatasetId, token),
    enabled: !!selectedDatasetId,
    ...realtimeFallbackPolling()
  });
  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });
  const selectedModel = useMemo(
    () => (modelsQuery.data?.items || []).find((m) => m.model_id === selectedModelId) || null,
    [modelsQuery.data, selectedModelId]
  );
  const modelVersionsQuery = useQuery({
    queryKey: mlairKeys.models.versions(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelVersions(tenantId, selectedModel?.project_id || projectId, selectedModelId, token),
    enabled: !!selectedModelId
  });
  const resolvedPipelineQuery = useQuery({
    queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelResolvedPipeline(tenantId, selectedModel?.project_id || projectId, selectedModelId, token),
    enabled: !!selectedModelId && !!selectedModel
  });
  const pipelinesQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token)
  });
  useEffect(() => {
    if (selectedModelId) return;
    const first = modelsQuery.data?.items?.[0]?.model_id;
    if (first) setSelectedModelId(first);
  }, [modelsQuery.data, selectedModelId]);
  const modelVersionToken = useMemo(() => {
    const items = modelVersionsQuery.data?.items || [];
    const prod = items.find((v) => String(v.stage || "").toLowerCase() === "production");
    if (prod) return `v${prod.version}`;
    const latest = items[0];
    return latest ? `v${latest.version}` : "v1";
  }, [modelVersionsQuery.data]);
  const modelSelectOptions = useMemo(
    () => (modelsQuery.data?.items || []).map((m) => ({ value: m.model_id, label: m.name })),
    [modelsQuery.data]
  );
  const pipelineSelectOptions = useMemo(
    () => [
      { value: "", label: "-- SELECT A PIPELINE --" },
      ...(pipelinesQuery.data?.items || []).map((p) => ({
        value: p.pipeline_id,
        label: `${p.pipeline_id}-${modelVersionToken}`
      }))
    ],
    [pipelinesQuery.data, modelVersionToken]
  );
  const resolvedPipelineId = useMemo(
    () => resolvedPipelineQuery.data?.pipeline_id || "",
    [resolvedPipelineQuery.data]
  );
  const pipelineMissing = !resolvedPipelineId && !(advancedMode && pipelineId);
  const effectivePipeline = advancedMode && pipelineId ? pipelineId : resolvedPipelineId;
  const pipelineVersionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, effectivePipeline),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, effectivePipeline, token),
    enabled: !!effectivePipeline
  });
  const pluginPrecheck = useMemo(() => {
    if (!effectivePipeline) return { ok: false, reason: "No pipeline selected" };
    const items = pipelineVersionsQuery.data?.items || [];
    if (!items.length) return { ok: false, reason: "Pipeline has no version" };
    const latest = items[0];
    const cfg = (latest?.config || {}) as Record<string, unknown>;
    const tasks = cfg.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { ok: false, reason: "Pipeline tasks are not configured" };
    }
    const hasPlugin = tasks.every((t) => {
      if (!t || typeof t !== "object") return false;
      const plugin = String((t as Record<string, unknown>).plugin || "").trim();
      return Boolean(plugin);
    });
    if (!hasPlugin) return { ok: false, reason: "Task plugin is missing in pipeline config" };
    return { ok: true, reason: "" };
  }, [effectivePipeline, pipelineVersionsQuery.data]);
  const previewMutation = useMutation({
    mutationFn: () => previewDatasetUpload(tenantId, projectId, token, datasetFile as File),
    onSuccess: (res) => setDatasetMsg(`Preview OK · rows=${res.row_count} · columns=${res.columns.length}`),
    onError: (e: any) => setDatasetMsg(`Preview failed: ${String(e?.message || e)}`)
  });
  const uploadMutation = useMutation({
    mutationFn: () => uploadDatasetCsv(tenantId, projectId, token, { dataset_name: datasetName.trim(), file: datasetFile as File }),
    onSuccess: async (res) => {
      setDatasetMsg(`Uploaded ${res.dataset_name} ${res.version}`);
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId) });
      setSelectedDatasetId(res.dataset_id);
    },
    onError: (e: any) => setDatasetMsg(`Upload failed: ${String(e?.message || e)}`)
  });
  const deleteDatasetMutation = useMutation({
    mutationFn: () => deleteDataset(tenantId, projectId, selectedDatasetId, token),
    onSuccess: async () => {
      setDatasetMsg("Dataset deleted");
      setSelectedDatasetId("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId) });
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, selectedDatasetId) });
    },
    onError: (e: any) => setDatasetMsg(`Delete dataset failed: ${String(e?.message || e)}`)
  });
  const deleteDatasetVersionMutation = useMutation({
    mutationFn: (versionId: string) => deleteDatasetVersion(tenantId, projectId, selectedDatasetId, versionId, token),
    onSuccess: async () => {
      setDatasetMsg("Dataset version deleted");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.versions(tenantId, projectId, selectedDatasetId) });
      await queryClient.invalidateQueries({ queryKey: mlairKeys.datasets.list(tenantId, projectId) });
    },
    onError: (e: any) => setDatasetMsg(`Delete version failed: ${String(e?.message || e)}`)
  });
  const openConfirm = (title: string, body: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  return (
    <RouteShell
      activeNav="Datasets"
      title="Dataset Hub"
      subtitle="Primary lifecycle surface: versions, readiness, eligibility, train — buffer strategies: docs/guides/dataset-accumulation-strategies.md; pipelines stay optional overrides"
    >
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={confirmTitle}
        body={confirmBody}
        onCancel={() => setConfirmOpen(false)}
        onDelete={() => {
          if (confirmAction) void confirmAction();
        }}
        isLoading={deleteDatasetMutation.isPending || deleteDatasetVersionMutation.isPending}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-2 rounded-xl border border-border bg-muted p-3">
            <input
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="dataset name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setDatasetFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="px-3 py-2 text-xs"
                onClick={() => previewMutation.mutate()}
                disabled={!datasetFile || previewMutation.isPending}
              >
                Preview
              </Button>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => uploadMutation.mutate()}
                disabled={!datasetFile || !datasetName.trim() || uploadMutation.isPending}
              >
                Create Dataset Version
              </Button>
            </div>
            {datasetMsg ? <div className="text-xs text-foreground">{datasetMsg}</div> : null}
          </div>
          <div className="mt-3">
            <DataTableShell>
            <DataTable className="text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Dataset</th>
                  <th className="px-3 py-2 text-left">Hub</th>
                  <th className="px-3 py-2 text-left">Rows</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(datasetsQuery.data?.items || []).map((d) => (
                  <tr
                    key={d.dataset_id}
                    className={`interactive-row cursor-pointer border-t border-border ${selectedDatasetId === d.dataset_id ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedDatasetId(d.dataset_id)}
                  >
                    <td className="px-3 py-2">{d.name}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/datasets/${encodeURIComponent(d.dataset_id)}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Link>
                    </td>
                    <td className="px-3 py-2">{d.current_size || 0}</td>
                    <td className="px-3 py-2">{formatDateTimeCompact(d.updated_at || d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            </DataTableShell>
          </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 flex-1 truncate text-section font-medium text-foreground">
              Dataset Versions {selectedDataset ? `- ${selectedDataset.name}` : ""}
            </h2>
            {selectedDatasetId ? (
              <Button
                variant="danger"
                className="rounded-lg px-3 py-1 text-xs"
                disabled={!selectedDatasetId || deleteDatasetMutation.isPending}
                onClick={() =>
                  openConfirm(
                    "Delete dataset",
                    `Delete dataset "${selectedDataset?.name || selectedDatasetId}" and all versions?`,
                    async () => {
                      await deleteDatasetMutation.mutateAsync();
                      setConfirmOpen(false);
                    }
                  )
                }
              >
                Delete Dataset
              </Button>
            ) : null}
          </div>
          {!selectedDatasetId ? (
            <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
              Select a dataset to view versions.
            </div>
          ) : (
            <>
              <div className="mb-3 grid gap-2 rounded-xl border border-border bg-muted p-3 md:grid-cols-5">
                <SelectDropdown
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  options={modelSelectOptions}
                  placeholder="Model"
                  className="md:col-span-2"
                  buttonClassName="rounded-md border border-border bg-secondary px-3 py-2 text-sm md:col-span-2"
                  aria-label="Model for training"
                />
                <div className="flex flex-col justify-center gap-0.5 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground md:col-span-2">
                  <span className="text-foreground">
                    Pipeline:{" "}
                    <span className="font-mono text-foreground">
                      {effectivePipeline || "—"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      (
                      {advancedMode && pipelineId
                        ? "override"
                        : resolvedPipelineQuery.data?.source === "unresolved"
                          ? "unresolved"
                          : "from model"}
                      )
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Base weights:{" "}
                    {resolvedPipelineQuery.data?.base_weights_source
                      ? `${resolvedPipelineQuery.data.base_weights_source}${
                          resolvedPipelineQuery.data.model_version != null &&
                          resolvedPipelineQuery.data.model_version !== undefined
                            ? ` · v${resolvedPipelineQuery.data.model_version}`
                            : ""
                        }`
                      : "none (cold start / upload a version)"}
                  </span>
                </div>
                <SelectDropdown
                  value={trainingMode}
                  onChange={setTrainingMode}
                  options={TRAINING_MODE_OPTIONS}
                  className="min-w-0"
                  buttonClassName="rounded-md border border-border bg-secondary px-3 py-2 text-sm"
                  aria-label="Training mode"
                />
              </div>
              <div className="mb-3 rounded-xl border border-border bg-muted p-3">
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} />
                  Advanced / compatibility (pipeline override)
                </label>
                {pipelineMissing ? (
                  <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                    Model has no resolved pipeline in current scope. Select pipeline below or configure default pipeline mapping.
                  </div>
                ) : null}
                {(advancedMode || pipelineMissing) ? (
                  <div className="mt-2">
                    <label className="text-xs text-muted-foreground">Pipeline override</label>
                    <SelectDropdown
                      value={pipelineId}
                      onChange={setPipelineId}
                      options={pipelineSelectOptions}
                      className="mt-1"
                      buttonClassName="rounded-md border border-border bg-secondary px-3 py-2 text-sm"
                      aria-label="Pipeline override"
                    />
                  </div>
                ) : null}
              </div>
              <DataTableShell>
                <DataTable className="text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Version</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Score</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(versionsQuery.data?.items || []).map((v) => (
                      <tr key={v.version_id} className="interactive-row border-t border-border">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{v.version}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${datasetStatusBadgeClass(v.status)}`}
                          >
                            {normalizeDatasetStatus(v.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2">{Number(v.quality_score ?? 0)}</td>
                        <td className="px-3 py-2">{formatDateTimeCompact(v.created_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <button
                            className="btn-action-cancel rounded-lg px-3 py-1 text-xs disabled:opacity-60"
                            title="View details"
                            aria-label="View details"
                            onClick={() => {
                              setDetailVersion(v);
                              setDetailOpen(true);
                            }}
                          >
                            <IconInfo />
                          </button>
                          <button
                            className="btn-action-primary ml-2 rounded-lg px-3 py-1 text-xs disabled:opacity-60"
                            title={pluginPrecheck.ok ? "Train" : pluginPrecheck.reason}
                            aria-label="Train"
                            onClick={async () => {
                              try {
                                const scopedPid = normalizeProjectId(String(projectId || "").trim());
                                const runContext: Record<string, string> = {};
                                if (scopedPid.startsWith("clinic_")) {
                                  runContext.clinic_id = scopedPid.slice("clinic_".length);
                                }
                                if (selectedModelId) {
                                  runContext.mlair_model_id = selectedModelId;
                                }
                                const res = await triggerRunFromModelDataset(tenantId, projectId, token, {
                                  model_id: selectedModelId,
                                  dataset_id: selectedDatasetId,
                                  dataset_version_id: v.version_id,
                                  ...(advancedMode && pipelineId ? { pipeline_id_override: pipelineId } : {}),
                                  idempotency_key: `dataset-page-train-${Date.now()}`,
                                  priority: "normal",
                                  max_parallel_tasks: 1,
                                  training_mode: trainingMode,
                                  ...(Object.keys(runContext).length ? { context: runContext } : {})
                                });
                                if (res.run_id) router.push(`/runs/${res.run_id}`);
                              } catch (err) {
                                setDatasetMsg(describeRunBlockError(err));
                              }
                            }}
                            disabled={
                              normalizeDatasetStatus(v.status) === "FAILED" ||
                              !selectedModelId ||
                              !pluginPrecheck.ok ||
                              pipelineVersionsQuery.isLoading
                            }
                          >
                            <IconStart />
                          </button>
                          <button
                            className="btn-action-delete ml-2 rounded-lg px-3 py-1 text-xs disabled:opacity-60"
                            title="Delete version"
                            aria-label="Delete version"
                            disabled={deleteDatasetVersionMutation.isPending}
                            onClick={() =>
                              openConfirm(
                                "Delete dataset version",
                                `Delete version "${v.version}" of dataset "${selectedDataset?.name || selectedDatasetId}"?`,
                                async () => {
                                  await deleteDatasetVersionMutation.mutateAsync(v.version_id);
                                  setConfirmOpen(false);
                                }
                              )
                            }
                          >
                            <IconDelete />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </DataTableShell>
            </>
          )}
        </Card>
      </div>
      <VersionDetailDialog
        open={detailOpen}
        version={detailVersion}
        onClose={() => setDetailOpen(false)}
      />
    </RouteShell>
  );
}

function VersionDetailDialog({
  open,
  version,
  onClose
}: {
  open: boolean;
  version: DatasetVersionItem | null;
  onClose: () => void;
}) {
  const summary = version && Array.isArray(version.summary) ? version.summary : [];
  const details = version && Array.isArray(version.details) ? version.details : [];

  return (
    <Dialog
      open={open && !!version}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle>Dataset version detail</DialogTitle>
          <DialogDescription>
            Quality summary and per-field issues for this immutable snapshot.
          </DialogDescription>
        </DialogHeader>
        {version ? (
          <>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground">
                <div>
                  Status:{" "}
                  <span className="font-semibold">{String(version.status || "ready")}</span>
                </div>
                <div>
                  Score: <span className="font-semibold">{Number(version.quality_score ?? 0)}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</div>
                {summary.length ? (
                  <ul className="mt-2 list-inside list-disc text-sm text-foreground">
                    {summary.map((item: string, idx: number) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">No summary</div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</div>
                {details.length ? (
                  <ul className="mt-2 max-h-52 space-y-1 overflow-auto rounded-lg border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
                    {details.map((item: Record<string, unknown>, idx: number) => (
                      <li key={idx} className="rounded-md border border-border bg-background/80 px-2 py-1.5">
                        <span className={detailSeverityClass(item)}>{formatDetailItem(item)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">No details</div>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function formatDetailItem(item: Record<string, unknown>): string {
  const column = String(item.column || item.field || "unknown");
  const issue = String(item.issue || "issue");
  const severity = String(item.severity || "info");
  const rawValue = item.value;
  const valueNum =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number.parseFloat(rawValue)
        : Number.NaN;
  const valueText =
    Number.isFinite(valueNum) && valueNum >= 0 && valueNum <= 1
      ? `${Math.round(valueNum * 100)}%`
      : rawValue !== undefined && rawValue !== null
        ? String(rawValue)
        : "-";
  return `${column}: ${valueText} ${issue} (${severity})`;
}

function detailSeverityClass(item: Record<string, unknown>): string {
  const severity = String(item.severity || "").toLowerCase();
  if (severity === "failed" || severity === "error" || severity === "critical") return "text-destructive";
  if (severity === "warning" || severity === "warn") return "text-[color:var(--status-pending-fg)]";
  return "text-primary";
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="8" r="1.2" fill="currentColor" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconStart() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9.5l5 2.5-5 2.5v-5z" fill="currentColor" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M8 7h8M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
