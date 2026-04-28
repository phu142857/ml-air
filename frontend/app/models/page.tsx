"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import {
  createModel,
  deleteModel,
  deleteModelVersion,
  fetchNextModelArtifactUri,
  fetchModels,
  fetchModelVersions,
  importModelVersionMany,
  promoteModelVersion
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { formatDateTimeCompact } from "@/lib/utils";

export default function ModelsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token)
  });

  const selectedModel = useMemo(
    () => modelsQuery.data?.items.find((m) => m.model_id === selectedModelId) ?? null,
    [modelsQuery.data, selectedModelId]
  );
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
    queryKey: ["model-versions", tenantId, projectId, selectedModelId],
    queryFn: () => fetchModelVersions(tenantId, selectedModel?.project_id || projectId, selectedModelId, token),
    enabled: !!selectedModelId && !!selectedModel && projectId !== "all"
  });
  const previewArtifactQuery = useQuery({
    queryKey: ["model-next-artifact", tenantId, selectedModel?.project_id || projectId, selectedModelId],
    queryFn: () => fetchNextModelArtifactUri(tenantId, selectedModel?.project_id || projectId, selectedModelId, token),
    enabled: !!selectedModelId && !!selectedModel && projectId !== "all"
  });

  const createModelMutation = useMutation({
    mutationFn: () =>
      createModel(tenantId, projectId, token, {
        name: newModelName,
        description: newModelDesc || null
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["models", tenantId, projectId] });
      setSelectedModelId(created.model_id);
    }
  });

  const createVersionMutation = useMutation({
    mutationFn: () =>
      importModelVersionMany(tenantId, selectedModel?.project_id || projectId, selectedModelId, token, {
        files: newVersionFiles,
        run_id: newVersionRunId || null,
        stage: "staging"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, selectedModelId] });
      setNewVersionRunId("");
      setNewVersionFiles([]);
    }
  });

  const promoteMutation = useMutation({
    mutationFn: ({ version, stage }: { version: number; stage: string }) =>
      promoteModelVersion(tenantId, selectedModel?.project_id || projectId, selectedModelId, token, { version, stage }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, selectedModelId] });
    }
  });
  const deleteModelMutation = useMutation({
    mutationFn: async (payload: { modelId: string; projectId: string }) =>
      deleteModel(tenantId, payload.projectId, payload.modelId, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["models", tenantId, projectId] });
      setSelectedModelId("");
    }
  });
  const deleteVersionMutation = useMutation({
    mutationFn: async (payload: { modelId: string; version: number; projectId: string }) =>
      deleteModelVersion(tenantId, payload.projectId, payload.modelId, payload.version, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, selectedModelId] });
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
    <RouteShell activeNav="Models" title="Models" subtitle="Model registry and promote workflow">
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
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Model Registry</h2>
          <div className="mb-3 space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="model name"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              value={newModelDesc}
              onChange={(e) => setNewModelDesc(e.target.value)}
              placeholder="description"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <button
              onClick={() => createModelMutation.mutate()}
              className="btn-action-primary rounded-lg px-3 py-2 text-xs disabled:opacity-60"
              disabled={createModelMutation.isPending || !newModelName.trim() || projectId === "all"}
            >
              Create Model
            </button>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(modelsQuery.data?.items ?? []).map((model) => (
                  <tr
                    key={model.model_id}
                    className={`interactive-row cursor-pointer border-t border-slate-800 ${selectedModelId === model.model_id ? "bg-blue-900/20" : ""}`}
                    onClick={() => setSelectedModelId(model.model_id)}
                  >
                    <td className="px-3 py-2">{model.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>{formatDateTimeCompact(model.updated_at)}</span>
                        <button
                          className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-blue-900/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/models/${model.model_id}`);
                          }}
                        >
                          Open
                        </button>
                        <button
                          className="btn-action-delete rounded-md px-2 py-1 text-xs"
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
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Versions {selectedModel ? `- ${selectedModel.name}` : ""}</h2>
          {!selectedModelId ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-400">
              Select a model to manage versions.
            </div>
          ) : projectId === "all" ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-400">
              Scope is <code>all</code>. Select a specific project in the topbar to create or promote versions.
            </div>
          ) : (
            <>
              <div className="mb-3 grid gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
                <input
                  value={newVersionRunId}
                  onChange={(e) => setNewVersionRunId(e.target.value)}
                  placeholder="run_id (optional)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <label className="text-xs text-slate-400">
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
                        ? "border-blue-500 bg-blue-500/10 text-slate-100"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    Drag and drop files here, or choose from disk
                    <input
                      type="file"
                      multiple
                      onChange={(e) => addUniqueFiles(Array.from(e.target.files || []))}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      accept=".pkl,.onnx,.pt,.bin,.joblib,.json,.txt,.yaml,.yml"
                    />
                  </div>
                </label>
                <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                  Upload all artifact files in one shot. Include <code>metadata.json</code> if available; otherwise backend
                  will auto-generate metadata.
                  <br />
                  Selected files: <span className="text-slate-200">{newVersionFiles.length}</span>
                  {newVersionFiles.length ? (
                    <>
                      {" · "}
                      <span className="text-slate-200">{newVersionFiles.map((f) => f.name).join(", ")}</span>
                    </>
                  ) : null}
                  <br />
                  Resolved artifact URI:{" "}
                  <span className="text-slate-200">{previewArtifactQuery.data?.artifact_uri || "N/A"}</span>
                </div>
                {newVersionFiles.length > 0 ? (
                  <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                    <div className="mb-2 font-semibold text-slate-200">Selected files</div>
                    <div className="max-h-36 space-y-1 overflow-auto">
                      {newVersionFiles.map((f) => (
                        <div
                          key={`${f.name}:${f.size}:${f.lastModified}`}
                          className="flex items-center justify-between gap-2 rounded border border-slate-700 px-2 py-1"
                        >
                          <span className="truncate">
                            {f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(f)}
                            className="rounded bg-slate-700 px-2 py-0.5 text-[11px] text-slate-100 hover:bg-slate-600"
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
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    Clear selected files
                  </button>
                ) : null}
                <button
                  onClick={() => createVersionMutation.mutate()}
                  className="btn-action-enable rounded-lg px-3 py-2 text-xs disabled:opacity-60"
                  disabled={createVersionMutation.isPending || newVersionFiles.length === 0 || !hasModelArtifact}
                >
                  Import model and create version (staging)
                </button>
              </div>
              <div className="overflow-auto rounded-xl border border-slate-700">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="w-[110px] px-3 py-2 text-left">Version</th>
                      <th className="w-[140px] px-3 py-2 text-left">Stage</th>
                      <th className="w-[420px] px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(versionsQuery.data?.items ?? []).map((v) => (
                      <tr key={v.version_id} className="interactive-row border-t border-slate-800 transition-colors">
                        <td className="px-3 py-2">v{v.version}</td>
                        <td className="px-3 py-2">
                          <span className="inline-block w-full truncate">{v.stage}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-nowrap gap-2">
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
                                      projectId: selectedModel?.project_id || projectId
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
                </table>
              </div>
            </>
          )}
        </section>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
        <p className="mb-4 text-sm text-slate-400">{body}</p>
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
