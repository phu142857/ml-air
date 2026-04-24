"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RouteShell } from "@/components/layout/route-shell";
import {
  createModel,
  createModelVersion,
  fetchModels,
  fetchModelVersions,
  promoteModelVersion
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function ModelsPage() {
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [newModelName, setNewModelName] = useState("demo-model");
  const [newModelDesc, setNewModelDesc] = useState("");
  const [newVersionRunId, setNewVersionRunId] = useState("");
  const [newVersionArtifactUri, setNewVersionArtifactUri] = useState("");

  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token)
  });

  const selectedModel = useMemo(
    () => modelsQuery.data?.items.find((m) => m.model_id === selectedModelId) ?? null,
    [modelsQuery.data, selectedModelId]
  );

  const versionsQuery = useQuery({
    queryKey: ["model-versions", tenantId, projectId, selectedModelId],
    queryFn: () => fetchModelVersions(tenantId, projectId, selectedModelId, token),
    enabled: !!selectedModelId
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
      createModelVersion(tenantId, projectId, selectedModelId, token, {
        run_id: newVersionRunId || null,
        artifact_uri: newVersionArtifactUri || null,
        stage: "staging"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, selectedModelId] });
    }
  });

  const promoteMutation = useMutation({
    mutationFn: (version: number) => promoteModelVersion(tenantId, projectId, selectedModelId, token, { version }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-versions", tenantId, projectId, selectedModelId] });
    }
  });

  return (
    <RouteShell activeNav="Models" title="Models" subtitle="Model registry and promote workflow">
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
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 disabled:opacity-60"
              disabled={createModelMutation.isPending || !newModelName.trim()}
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
                    className={`cursor-pointer border-t border-slate-800 ${selectedModelId === model.model_id ? "bg-slate-800/80" : "hover:bg-slate-800/60"}`}
                    onClick={() => setSelectedModelId(model.model_id)}
                  >
                    <td className="px-3 py-2">{model.name}</td>
                    <td className="px-3 py-2">{model.updated_at}</td>
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
          ) : (
            <>
              <div className="mb-3 grid gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
                <input
                  value={newVersionRunId}
                  onChange={(e) => setNewVersionRunId(e.target.value)}
                  placeholder="run_id (optional)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={newVersionArtifactUri}
                  onChange={(e) => setNewVersionArtifactUri(e.target.value)}
                  placeholder="artifact_uri (optional)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <button
                  onClick={() => createVersionMutation.mutate()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
                  disabled={createVersionMutation.isPending}
                >
                  Create Version (staging)
                </button>
              </div>
              <div className="overflow-auto rounded-xl border border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Version</th>
                      <th className="px-3 py-2 text-left">Stage</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(versionsQuery.data?.items ?? []).map((v) => (
                      <tr key={v.version_id} className="border-t border-slate-800">
                        <td className="px-3 py-2">v{v.version}</td>
                        <td className="px-3 py-2">{v.stage}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => promoteMutation.mutate(v.version)}
                            className="rounded-lg bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-60"
                            disabled={promoteMutation.isPending}
                          >
                            Promote to production
                          </button>
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
