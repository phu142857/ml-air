"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import {
  createModel,
  deleteModel,
  deleteModelVersion,
  fetchModelServing,
  fetchNextModelArtifactUri,
  fetchModels,
  fetchModelVersions,
  importModelVersionMany,
  promoteModelVersion,
  setModelServingSlot,
  updateModelVersionApproval
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import { modelApprovalPillClass } from "@/lib/model-governance-ui";
import { formatApiClientError, formatDateTimeCompact } from "@/lib/utils";
import { useServingSlotsHttpFeature } from "@/lib/use-serving-slots-http-feature";

const SERVING_SLOTS = ["champion", "candidate", "challenger", "canary"] as const;

export default function ModelsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const servingSlotsUi = useServingSlotsHttpFeature();
  const { tenantId, projectId, token } = useAppContext();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [newModelName, setNewModelName] = useState("demo-model");
  const [newModelDesc, setNewModelDesc] = useState("");
  const [newVersionRunId, setNewVersionRunId] = useState("");
  const [newVersionFiles, setNewVersionFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmBody, setConfirmBody] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);
  const [versionBanner, setVersionBanner] = useState("");
  const [servingSlotDraft, setServingSlotDraft] = useState<Record<string, string>>({});

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });

  const selectedModel = useMemo(
    () => modelsQuery.data?.items.find((m) => m.model_id === selectedModelId) ?? null,
    [modelsQuery.data, selectedModelId]
  );
  const effectiveProjectId = selectedModel?.project_id || projectId;

  useEffect(() => {
    setServingSlotDraft({});
    setVersionBanner("");
  }, [selectedModelId]);

  const hasModelArtifact = useMemo(() => {
    const modelExts = new Set([".pkl", ".onnx", ".pt", ".bin", ".joblib"]);
    return newVersionFiles.some((f) => {
      const name = f.name.toLowerCase();
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "";
      return modelExts.has(ext);
    });
  }, [newVersionFiles]);

  const versionsQuery = useQuery({
    queryKey: mlairKeys.models.versions(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelVersions(tenantId, effectiveProjectId, selectedModelId, token),
    enabled: !!selectedModelId && !!selectedModel && projectId !== "all",
    ...realtimeFallbackPolling()
  });
  const servingQuery = useQuery({
    queryKey: mlairKeys.models.serving(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelServing(tenantId, effectiveProjectId, selectedModelId, token),
    enabled: servingSlotsUi && !!selectedModelId && !!selectedModel && projectId !== "all",
    ...realtimeFallbackPolling()
  });
  const previewArtifactQuery = useQuery({
    queryKey: mlairKeys.models.nextArtifact(tenantId, effectiveProjectId, selectedModelId),
    queryFn: () => fetchNextModelArtifactUri(tenantId, effectiveProjectId, selectedModelId, token),
    enabled: !!selectedModelId && !!selectedModel && projectId !== "all",
    ...realtimeFallbackPolling()
  });

  const createModelMutation = useMutation({
    mutationFn: () =>
      createModel(tenantId, projectId, token, {
        name: newModelName,
        description: newModelDesc || null
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId) });
      setSelectedModelId(created.model_id);
    }
  });

  const createVersionMutation = useMutation({
    mutationFn: () =>
      importModelVersionMany(tenantId, effectiveProjectId, selectedModelId, token, {
        files: newVersionFiles,
        run_id: newVersionRunId || null,
        stage: "staging"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, selectedModelId) });
      setNewVersionRunId("");
      setNewVersionFiles([]);
    }
  });

  const promoteMutation = useMutation({
    mutationFn: ({ version, stage }: { version: number; stage: string }) =>
      promoteModelVersion(tenantId, effectiveProjectId, selectedModelId, token, { version, stage }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, selectedModelId) });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });

  const approvalMutation = useMutation({
    mutationFn: (p: { version: number; approval_status: "approved" | "rejected" }) =>
      updateModelVersionApproval(tenantId, effectiveProjectId, selectedModelId, p.version, token, {
        approval_status: p.approval_status,
        reason: p.approval_status === "rejected" ? "rejected via UI" : null
      }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, selectedModelId) });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });

  const servingAssignMutation = useMutation({
    mutationFn: (p: { slot: string; version: number }) =>
      setModelServingSlot(tenantId, effectiveProjectId, selectedModelId, p.slot, token, { version: p.version }),
    onSuccess: async () => {
      setVersionBanner("");
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.serving(tenantId, projectId, selectedModelId) });
    },
    onError: (e: unknown) => setVersionBanner(formatApiClientError(e))
  });
  const deleteModelMutation = useMutation({
    mutationFn: async (payload: { modelId: string; projectId: string }) =>
      deleteModel(tenantId, payload.projectId, payload.modelId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId) });
      setSelectedModelId("");
    }
  });
  const deleteVersionMutation = useMutation({
    mutationFn: async (payload: { modelId: string; version: number; projectId: string }) =>
      deleteModelVersion(tenantId, payload.projectId, payload.modelId, payload.version, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.versions(tenantId, projectId, selectedModelId) });
    }
  });

  const openConfirm = (title: string, body: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };
  const addUniqueFiles = (incoming: File[]) => {
    setNewVersionFiles((prev) => {
      const map = new Map<string, File>();
      for (const f of prev) map.set(`${f.name}:${f.size}:${f.lastModified}`, f);
      for (const f of incoming) map.set(`${f.name}:${f.size}:${f.lastModified}`, f);
      return Array.from(map.values());
    });
  };
  const removeSelectedFile = (target: File) => {
    setNewVersionFiles((prev) =>
      prev.filter((f) => !(f.name === target.name && f.size === target.size && f.lastModified === target.lastModified))
    );
  };

  return (
    <RouteShell
      activeNav="Models"
      title="Models"
      subtitle="Governance domain: approvals, policies, serving — training intent delegates to Dataset Hub flow"
    >
      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        body={confirmBody}
        onCancel={() => setConfirmOpen(false)}
        onDelete={() => {
          if (confirmAction) void confirmAction();
        }}
        isLoading={deleteModelMutation.isPending || deleteVersionMutation.isPending}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Model Registry</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="mb-3 space-y-2 rounded-xl border border-border bg-muted p-3">
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="model name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <input
              value={newModelDesc}
              onChange={(e) => setNewModelDesc(e.target.value)}
              placeholder="description"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <Button
              onClick={() => createModelMutation.mutate()}
              className="px-3 py-2 text-xs"
              disabled={createModelMutation.isPending || !newModelName.trim() || projectId === "all"}
            >
              Create Model
            </Button>
          </div>
          <DataTableShell>
            <DataTable className="text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(modelsQuery.data?.items ?? []).map((model) => (
                  <tr
                    key={model.model_id}
                    className={`interactive-row cursor-pointer border-t border-border ${selectedModelId === model.model_id ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedModelId(model.model_id)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{model.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>{formatDateTimeCompact(model.updated_at)}</span>
                        <Button
                          variant="secondary"
                          className="rounded-md px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/models/${model.model_id}`);
                          }}
                        >
                          Open
                        </Button>
                        <Button
                          variant="danger"
                          className="rounded-md px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openConfirm(
                              "Delete model",
                              `Delete model "${model.name}" and all of its versions?`,
                              async () => {
                                await deleteModelMutation.mutateAsync({
                                  modelId: model.model_id,
                                  projectId: model.project_id
                                });
                                setConfirmOpen(false);
                              }
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </DataTableShell>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section font-semibold text-foreground">
              Versions {selectedModel ? `- ${selectedModel.name}` : ""}
            </h2>
            {versionBanner ? <span className="version-inline-banner">{versionBanner}</span> : null}
          </div>
          {!selectedModelId ? (
            <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
              Select a model to manage versions.
            </div>
          ) : projectId === "all" ? (
            <div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
              Scope is <code>all</code>. Select a specific project in the topbar to create or promote versions.
            </div>
          ) : (
            <>
              <div className="mb-3 grid gap-2 rounded-xl border border-border bg-muted p-3">
                <input
                  value={newVersionRunId}
                  onChange={(e) => setNewVersionRunId(e.target.value)}
                  placeholder="run_id (optional)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <label className="text-xs text-muted-foreground">
                  Artifacts (multi-file upload)
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      addUniqueFiles(Array.from(e.dataTransfer.files || []));
                    }}
                    className={`mt-1 rounded-lg border-2 border-dashed px-3 py-3 text-xs transition-colors ${
                      isDragOver
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}
                  >
                    Drag and drop files here, or choose from disk
                    <input
                      type="file"
                      multiple
                      onChange={(e) => addUniqueFiles(Array.from(e.target.files || []))}
                      className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
                      accept=".pkl,.onnx,.pt,.bin,.joblib,.json,.txt,.yaml,.yml"
                    />
                  </div>
                </label>
                <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  Upload all artifact files in one shot. Include <code>metadata.json</code> if available; otherwise backend
                  will auto-generate metadata.
                  <br />
                  Selected files: <span className="text-foreground">{newVersionFiles.length}</span>
                  {newVersionFiles.length ? (
                    <>
                      {" · "}
                      <span className="text-foreground">{newVersionFiles.map((f) => f.name).join(", ")}</span>
                    </>
                  ) : null}
                  <br />
                  Resolved artifact URI:{" "}
                  <span className="text-foreground">{previewArtifactQuery.data?.artifact_uri || "N/A"}</span>
                </div>
                {newVersionFiles.length > 0 ? (
                  <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <div className="mb-2 font-semibold text-foreground">Selected files</div>
                    <div className="max-h-36 space-y-1 overflow-auto">
                      {newVersionFiles.map((f) => (
                        <div
                          key={`${f.name}:${f.size}:${f.lastModified}`}
                          className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"
                        >
                          <span className="truncate">
                            {f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(f)}
                            className="rounded bg-secondary px-2 py-0.5 text-caption text-foreground hover:bg-muted"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {newVersionFiles.length > 0 && !hasModelArtifact ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    Missing model artifact. Please include at least one of: <code>.pkl</code>, <code>.onnx</code>,{" "}
                    <code>.pt</code>, <code>.bin</code>, <code>.joblib</code>.
                  </div>
                ) : null}
                {newVersionFiles.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setNewVersionFiles([])}
                    className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground hover:bg-muted"
                  >
                    Clear selected files
                  </button>
                ) : null}
                <Button
                  onClick={() => createVersionMutation.mutate()}
                  className="px-3 py-2 text-xs"
                  disabled={createVersionMutation.isPending || newVersionFiles.length === 0 || !hasModelArtifact}
                >
                  Import model and create version (staging)
                </Button>
              </div>
              {servingSlotsUi ? (
                <div className="mb-3 rounded-xl border border-border bg-muted p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-foreground">Serving slots</h3>
                  </div>
                  <p className="mb-2 text-caption text-muted-foreground">
                    Map a registry version to champion / candidate / challenger / canary.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SERVING_SLOTS.map((slot) => {
                      const cur = servingQuery.data?.slots?.[slot];
                      return (
                        <div
                          key={slot}
                          className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-2 text-xs"
                        >
                          <span className="font-medium capitalize text-foreground">{slot}</span>
                          <span className="text-muted-foreground">{cur ? `v${cur.version}` : "—"}</span>
                          <input
                            type="number"
                            min={1}
                            value={servingSlotDraft[slot] ?? ""}
                            onChange={(e) =>
                              setServingSlotDraft((prev) => ({ ...prev, [slot]: e.target.value }))
                            }
                            placeholder="ver"
                            className="w-20 rounded border border-border bg-secondary px-2 py-1 text-foreground"
                          />
                          <button
                            type="button"
                            className="rounded-lg bg-secondary px-2 py-1 text-caption text-foreground hover:bg-muted disabled:opacity-60"
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
                </div>
              ) : null}
              <DataTableShell>
                <DataTable className="w-full table-fixed text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="w-[110px] px-3 py-2 text-left">Version</th>
                      <th className="w-[120px] px-3 py-2 text-left">Stage</th>
                      <th className="w-[160px] px-3 py-2 text-left">Approval</th>
                      <th className="min-w-[320px] px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(versionsQuery.data?.items ?? []).map((v) => (
                      <tr key={v.version_id} className="interactive-row border-t border-border transition-colors">
                        <td className="px-3 py-2">v{v.version}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                            v.stage === "production"
                              ? "border-[#3ecf8e]/40 bg-[#3ecf8e]/15 text-[#3ecf8e]"
                              : "border-border bg-muted text-foreground"
                          }`}>
                            {v.stage === "production" ? "●" : "○"} {v.stage}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-block w-fit max-w-full truncate ${modelApprovalPillClass(
                                v.approval_status
                              )}`}
                              title={v.approval_reason || undefined}
                            >
                              {v.approval_status || "—"}
                            </span>
                            {v.approval_status === "pending_manual_approval" ? (
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  className="approval-action-btn approval-action-btn--approve"
                                  disabled={approvalMutation.isPending}
                                  onClick={() =>
                                    approvalMutation.mutate({ version: v.version, approval_status: "approved" })
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="approval-action-btn approval-action-btn--reject"
                                  disabled={approvalMutation.isPending}
                                  onClick={() =>
                                    approvalMutation.mutate({ version: v.version, approval_status: "rejected" })
                                  }
                                >
                                  Reject
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => promoteMutation.mutate({ version: v.version, stage: "production" })}
                              className="action-btn-sm btn-action-promote rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                              disabled={promoteMutation.isPending || v.stage === "production"}
                            >
                              Promote
                            </button>
                            <button
                              onClick={() => promoteMutation.mutate({ version: v.version, stage: "staging" })}
                              className="action-btn-md btn-action-rollback rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                              disabled={promoteMutation.isPending || v.stage === "staging"}
                            >
                              Rollback to staging
                            </button>
                            <button
                              onClick={() =>
                                openConfirm(
                                  "Delete version",
                                  `Delete version v${v.version} of model "${selectedModel?.name || selectedModelId}"?`,
                                  async () => {
                                    await deleteVersionMutation.mutateAsync({
                                      modelId: selectedModelId,
                                      version: v.version,
                                      projectId: effectiveProjectId
                                    });
                                    setConfirmOpen(false);
                                  }
                                )
                              }
                              className="action-btn-xs btn-action-delete rounded-lg px-2 py-1 text-xs disabled:opacity-60"
                              disabled={deleteVersionMutation.isPending}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </DataTableShell>
            </>
          )}
          </CardContent>
        </Card>
      </div>
    </RouteShell>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  onDelete,
  onCancel,
  isLoading
}: {
  open: boolean;
  title: string;
  body: string;
  onDelete: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-section font-semibold text-foreground">{title}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-action-cancel rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="btn-action-delete rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            disabled={isLoading}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
