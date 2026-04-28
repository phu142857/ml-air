"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import {
  fetchDatasets,
  fetchDatasetVersions,
  fetchModelResolvedPipeline,
  fetchModels,
  fetchModelVersions,
  fetchPipelines,
  previewDatasetUpload,
  triggerPipelineRunWithGating,
  uploadDatasetCsv
} from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function DatasetsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantId, projectId, token } = useAppContext();
  const [datasetName, setDatasetName] = useState("user_events");
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [trainingMode, setTrainingMode] = useState("standard");
  const [datasetMsg, setDatasetMsg] = useState("");

  const datasetsQuery = useQuery({
    queryKey: ["datasets", tenantId, projectId],
    queryFn: () => fetchDatasets(tenantId, projectId, token)
  });
  const selectedDataset = useMemo(
    () => (datasetsQuery.data?.items || []).find((d) => d.dataset_id === selectedDatasetId) || null,
    [datasetsQuery.data, selectedDatasetId]
  );
  const versionsQuery = useQuery({
    queryKey: ["dataset-versions", tenantId, projectId, selectedDatasetId],
    queryFn: () => fetchDatasetVersions(tenantId, projectId, selectedDatasetId, token),
    enabled: !!selectedDatasetId
  });
  const modelsQuery = useQuery({
    queryKey: ["models", tenantId, projectId],
    queryFn: () => fetchModels(tenantId, projectId, token)
  });
  const selectedModel = useMemo(
    () => (modelsQuery.data?.items || []).find((m) => m.model_id === selectedModelId) || null,
    [modelsQuery.data, selectedModelId]
  );
  const modelVersionsQuery = useQuery({
    queryKey: ["model-versions-for-datasets-page", tenantId, projectId, selectedModelId],
    queryFn: () => fetchModelVersions(tenantId, selectedModel?.project_id || projectId, selectedModelId, token),
    enabled: !!selectedModelId
  });
  const resolvedPipelineQuery = useQuery({
    queryKey: ["model-resolved-pipeline", tenantId, projectId, selectedModelId],
    queryFn: () => fetchModelResolvedPipeline(tenantId, selectedModel?.project_id || projectId, selectedModelId, token),
    enabled: !!selectedModelId && !!selectedModel
  });
  const pipelinesQuery = useQuery({
    queryKey: ["pipelines", tenantId, projectId],
    queryFn: () => fetchPipelines(tenantId, projectId, token)
  });
  useEffect(() => {
    if (pipelineId) return;
    const first = pipelinesQuery.data?.items?.[0]?.pipeline_id;
    if (first) setPipelineId(first);
  }, [pipelinesQuery.data, pipelineId]);
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
  const resolvedPipelineId = useMemo(
    () => resolvedPipelineQuery.data?.pipeline_id || "",
    [resolvedPipelineQuery.data]
  );
  const pipelineMissing = !resolvedPipelineId;
  const previewMutation = useMutation({
    mutationFn: () => previewDatasetUpload(tenantId, projectId, token, datasetFile as File),
    onSuccess: (res) => setDatasetMsg(`Preview OK · rows=${res.row_count} · columns=${res.columns.length}`),
    onError: (e: any) => setDatasetMsg(`Preview failed: ${String(e?.message || e)}`)
  });
  const uploadMutation = useMutation({
    mutationFn: () => uploadDatasetCsv(tenantId, projectId, token, { dataset_name: datasetName.trim(), file: datasetFile as File }),
    onSuccess: async (res) => {
      setDatasetMsg(`Uploaded ${res.dataset_name} ${res.version}`);
      await queryClient.invalidateQueries({ queryKey: ["datasets", tenantId, projectId] });
      setSelectedDatasetId(res.dataset_id);
    },
    onError: (e: any) => setDatasetMsg(`Upload failed: ${String(e?.message || e)}`)
  });

  return (
    <RouteShell activeNav="Datasets" title="Datasets" subtitle="Upload CSV, manage versions, and train from dataset">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Upload CSV</h2>
          <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <input
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="dataset name"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setDatasetFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <div className="flex gap-2">
              <button
                className="btn-action-cancel rounded-lg px-3 py-2 text-xs disabled:opacity-60"
                onClick={() => previewMutation.mutate()}
                disabled={!datasetFile || previewMutation.isPending}
              >
                Preview
              </button>
              <button
                className="btn-action-enable rounded-lg px-3 py-2 text-xs disabled:opacity-60"
                onClick={() => uploadMutation.mutate()}
                disabled={!datasetFile || !datasetName.trim() || uploadMutation.isPending}
              >
                Create Dataset Version
              </button>
            </div>
            {datasetMsg ? <div className="text-xs text-slate-200">{datasetMsg}</div> : null}
          </div>
          <div className="mt-3 overflow-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Dataset</th>
                  <th className="px-3 py-2 text-left">Rows</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(datasetsQuery.data?.items || []).map((d) => (
                  <tr
                    key={d.dataset_id}
                    className={`interactive-row cursor-pointer border-t border-slate-800 ${selectedDatasetId === d.dataset_id ? "bg-blue-900/20" : ""}`}
                    onClick={() => setSelectedDatasetId(d.dataset_id)}
                  >
                    <td className="px-3 py-2">{d.name}</td>
                    <td className="px-3 py-2">{d.current_size || 0}</td>
                    <td className="px-3 py-2">{d.updated_at || d.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Dataset Versions {selectedDataset ? `- ${selectedDataset.name}` : ""}
          </h2>
          {!selectedDatasetId ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-400">
              Select a dataset to view versions.
            </div>
          ) : (
            <>
              <div className="mb-3 grid gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 md:grid-cols-5">
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 md:col-span-2"
                >
                  {(modelsQuery.data?.items || []).map((m) => (
                    <option key={m.model_id} value={m.model_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 md:col-span-2">
                  <span className="ml-1 text-slate-100">
                    {resolvedPipelineId ? `${resolvedPipelineId}-${modelVersionToken}` : "Not configured"}
                  </span>
                </div>
                <select
                  value={trainingMode}
                  onChange={(e) => setTrainingMode(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="quick">Quick</option>
                  <option value="standard">Standard</option>
                  <option value="full">Full</option>
                </select>
              </div>
              <div className="mb-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input type="checkbox" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} />
                  Advanced settings
                </label>
                {pipelineMissing ? (
                  <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                    Model has no resolved pipeline in current scope. Select pipeline below or configure default pipeline mapping.
                  </div>
                ) : null}
                {(advancedMode || pipelineMissing) ? (
                  <div className="mt-2">
                    <label className="text-xs text-slate-400">Pipeline override</label>
                    <select
                      value={pipelineId}
                      onChange={(e) => setPipelineId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="">-- SELECT A PIPELINE --</option>
                      {(pipelinesQuery.data?.items || []).map((p) => (
                        <option key={p.pipeline_id} value={p.pipeline_id}>
                          {`${p.pipeline_id}-${modelVersionToken}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              <div className="overflow-auto rounded-xl border border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Version</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(versionsQuery.data?.items || []).map((v) => (
                      <tr key={v.version_id} className="interactive-row border-t border-slate-800">
                        <td className="px-3 py-2">{v.version}</td>
                        <td className="px-3 py-2">{v.created_at}</td>
                        <td className="px-3 py-2">
                          <button
                            className="btn-action-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60"
                            onClick={async () => {
                              const effectivePipeline = pipelineId || resolvedPipelineId;
                              const res = await triggerPipelineRunWithGating(tenantId, projectId, effectivePipeline, token, {
                                pipeline_id: effectivePipeline,
                                idempotency_key: `dataset-page-train-${Date.now()}`,
                                priority: "normal",
                                max_parallel_tasks: 1,
                                training_mode: trainingMode,
                                override_config: {
                                  dataset_version_id: v.version_id,
                                  inputs: [{ dataset: selectedDataset?.name || "user_events", required_size: 1 }]
                                }
                              });
                              if (res.run_id) router.push(`/runs/${res.run_id}`);
                            }}
                            disabled={!resolvedPipelineId && !pipelineId}
                          >
                            Train with this version
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
