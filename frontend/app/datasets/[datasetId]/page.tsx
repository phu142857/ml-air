"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { TrainingGateFields } from "@/components/readiness/training-gate-fields";
import {
  fetchDataset,
  fetchDatasetReadiness,
  fetchDatasetVersions,
  fetchModels,
  fetchModelResolvedPipeline,
  fetchPipelineVersions,
  normalizeProjectId
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import { datasetStatusBadgeClass, normalizeDatasetStatus } from "@/lib/status-style";
import { executeTrainingIntent } from "@/lib/training-intent";
import { useAppContext } from "@/lib/app-context";
import { formatDateTimeCompact } from "@/lib/utils";

function describeTrainError(err: unknown): string {
  const fallback = String((err as { message?: string })?.message || err || "Unknown error");
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
    // keep fallback
  }
  return `Train failed: ${fallback}`;
}

export default function DatasetHubPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = decodeURIComponent(params.datasetId);
  const router = useRouter();
  const { tenantId, projectId, token } = useAppContext();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [trainingMode, setTrainingMode] = useState("standard");
  const [requiredSize, setRequiredSize] = useState("1000");
  const [readinessThreshold, setReadinessThreshold] = useState(1000);
  const [trainMsg, setTrainMsg] = useState("");

  const datasetQuery = useQuery({
    queryKey: mlairKeys.datasets.detail(tenantId, projectId, datasetId),
    queryFn: () => fetchDataset(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token),
    ...realtimeFallbackPolling()
  });
  const dataset = datasetQuery.data ?? null;

  const versionsQuery = useQuery({
    queryKey: mlairKeys.datasets.versions(tenantId, projectId, datasetId),
    queryFn: () => fetchDatasetVersions(tenantId, projectId, datasetId, token),
    enabled: Boolean(datasetId && token),
    ...realtimeFallbackPolling()
  });

  const readinessQuery = useQuery({
    queryKey: mlairKeys.datasets.readiness(tenantId, projectId, datasetId, readinessThreshold),
    queryFn: () => fetchDatasetReadiness(tenantId, projectId, datasetId, token, readinessThreshold),
    enabled: Boolean(datasetId && token && dataset),
    ...realtimeFallbackPolling()
  });

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    ...realtimeFallbackPolling()
  });

  const resolvedPipelineQuery = useQuery({
    queryKey: mlairKeys.models.resolvedPipeline(tenantId, projectId, selectedModelId),
    queryFn: () => fetchModelResolvedPipeline(tenantId, projectId, selectedModelId, token),
    enabled: Boolean(selectedModelId && token)
  });

  const effectivePipeline = resolvedPipelineQuery.data?.pipeline_id || "";
  const pipelineVersionsQuery = useQuery({
    queryKey: mlairKeys.pipelines.versions(tenantId, projectId, effectivePipeline),
    queryFn: () => fetchPipelineVersions(tenantId, projectId, effectivePipeline, token),
    enabled: Boolean(effectivePipeline && token)
  });
  const pluginPrecheck = useMemo(() => {
    if (!effectivePipeline) return { ok: false, reason: "Select a model with a resolved pipeline" };
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
      return Boolean(String((t as Record<string, unknown>).plugin || "").trim());
    });
    if (!hasPlugin) return { ok: false, reason: "Task plugin is missing in pipeline config" };
    return { ok: true, reason: "" };
  }, [effectivePipeline, pipelineVersionsQuery.data]);

  return (
    <RouteShell
      activeNav="Datasets"
      title={dataset ? `Dataset · ${dataset.name}` : `Dataset ${datasetId.slice(0, 8)}…`}
      subtitle="Readiness, versions, and intent-driven training (dataset / model lifecycle hub)"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/datasets"
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-blue-900/20"
        >
          ← All datasets
        </Link>
        <Link
          href={`/lineage?datasetVersionId=${encodeURIComponent(versionsQuery.data?.items?.[0]?.version_id || "")}`}
          className={`rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-blue-900/20 ${!versionsQuery.data?.items?.[0]?.version_id ? "pointer-events-none opacity-50" : ""}`}
        >
          Lineage (latest version)
        </Link>
      </div>

      {datasetQuery.isError && datasetQuery.isFetched ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Could not load dataset (check scope or id).
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-section font-semibold text-slate-200">Readiness (dataset API)</h2>
          <p className="mb-3 text-xs text-slate-400">
            Evaluates <span className="text-slate-200">current_size</span> vs a threshold for this dataset record (not
            full multi-input pipeline gate). Pipeline gate still runs on train.
          </p>
          <label className="mb-3 block text-xs text-slate-400">
            Threshold (rows)
            <input
              type="number"
              min={1}
              value={readinessThreshold}
              onChange={(e) => setReadinessThreshold(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
            />
          </label>
          {readinessQuery.data ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">
              <div className="mb-2 text-slate-200">
                Ready:{" "}
                <span className={readinessQuery.data.ready ? "text-emerald-400" : "text-red-400"}>
                  {String(readinessQuery.data.ready)}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Current: {readinessQuery.data.current_size} · Required: {readinessQuery.data.required_size}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{readinessQuery.isLoading ? "Loading…" : "—"}</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-section font-semibold text-slate-200">Train model (intent)</h2>
          <p className="mb-3 text-xs text-slate-400">
            Uses <code className="text-slate-300">POST /runs/trigger</code> — resolves pipeline and base weights server-side.
          </p>
          <div className="mb-3">
            <label className="text-xs text-slate-400">Model</label>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">— select model —</option>
              {(modelsQuery.data?.items || []).map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
            Pipeline:{" "}
            <span className="font-mono text-slate-100">{effectivePipeline || "—"}</span>
            {resolvedPipelineQuery.data?.source ? (
              <span className="text-slate-500"> ({resolvedPipelineQuery.data.source})</span>
            ) : null}
          </div>
          <TrainingGateFields
            trainingMode={trainingMode}
            onTrainingModeChange={setTrainingMode}
            requiredSize={requiredSize}
            onRequiredSizeChange={setRequiredSize}
            className="mb-3"
          />
          {trainMsg ? <div className="mb-2 text-xs text-amber-200">{trainMsg}</div> : null}
          <div className="overflow-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {(versionsQuery.data?.items || []).map((v) => (
                  <tr key={v.version_id} className="border-t border-slate-800">
                    <td className="px-3 py-2">{v.version}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${datasetStatusBadgeClass(v.status)}`}
                      >
                        {normalizeDatasetStatus(v.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-900/40 disabled:opacity-50"
                        disabled={
                          !selectedModelId ||
                          normalizeDatasetStatus(v.status) === "FAILED" ||
                          !pluginPrecheck.ok ||
                          pipelineVersionsQuery.isLoading
                        }
                        title={pluginPrecheck.ok ? "Train" : pluginPrecheck.reason}
                        onClick={async () => {
                          setTrainMsg("");
                          try {
                            const scopedPid = normalizeProjectId(String(projectId || "").trim());
                            const runContext: Record<string, string> = {};
                            if (scopedPid.startsWith("clinic_")) {
                              runContext.clinic_id = scopedPid.slice("clinic_".length);
                            }
                            runContext.mlair_model_id = selectedModelId;
                            const res = await executeTrainingIntent(tenantId, projectId, token, {
                              kind: "model_dataset",
                              modelId: selectedModelId,
                              datasetId,
                              datasetVersionId: v.version_id,
                              idempotencyKey: `dataset-hub-train-${Date.now()}`,
                              trainingMode,
                              context: Object.keys(runContext).length ? runContext : undefined
                            });
                            if (res.run_id) router.push(`/runs/${res.run_id}`);
                          } catch (err) {
                            setTrainMsg(describeTrainError(err));
                          }
                        }}
                      >
                        Train
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(versionsQuery.data?.items || []).length === 0 && !versionsQuery.isLoading ? (
              <p className="p-4 text-xs text-slate-500">No versions yet.</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-2 text-section font-semibold text-slate-200">Metadata</h2>
        {dataset ? (
          <dl className="grid gap-2 text-xs text-slate-400 md:grid-cols-2">
            <div>
              <dt className="text-slate-500">dataset_id</dt>
              <dd className="font-mono text-slate-200">{dataset.dataset_id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">current_size</dt>
              <dd className="text-slate-200">{dataset.current_size ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">updated</dt>
              <dd className="text-slate-200">{formatDateTimeCompact(dataset.updated_at || dataset.created_at)}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </RouteShell>
  );
}
