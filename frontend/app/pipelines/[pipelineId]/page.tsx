"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { DagView } from "@/components/pipeline/dag-view";
import { TrainingGateFields } from "@/components/readiness/training-gate-fields";
import { checkPipelineReadiness, fetchPipelineDag, normalizeProjectId, triggerPipelineRunWithGating } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";

export default function PipelineDetailPage() {
  const router = useRouter();
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = params.pipelineId;
  const { tenantId, projectId, token } = useAppContext();
  const [trainingMode, setTrainingMode] = useState("standard");
  const [requiredSize, setRequiredSize] = useState("1000");
  const [gateResult, setGateResult] = useState<any>(null);
  const [gateError, setGateError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  /** Must match the `dataset` string in this pipeline's readiness inputs (pipeline version config). */
  const [readinessDatasetInput, setReadinessDatasetInput] = useState("");

  const { data } = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineDag(tenantId, projectId, pipelineId, token)
  });

  const tasks = useMemo(
    () => (data?.nodes ?? []).map((node) => ({ task_id: node.id, status: node.status, attempt: 1 })),
    [data]
  );

  return (
    <RouteShell activeNav="Pipelines" title={`Pipeline ${pipelineId}`} subtitle="Deep-link pipeline detail">
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-blue-900/20"
          onClick={() => router.push("/pipelines")}
        >
          Back to Pipelines
        </button>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-blue-900/20"
        >
          Versions
        </Link>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/diff`}
          className="rounded-xl border border-amber-600/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
        >
          Config diff
        </Link>
      </div>
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-section font-semibold text-slate-200">DAG</h2>
        <DagView tasks={tasks} />
      </section>
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-section font-semibold text-slate-200">Readiness & Gating</h2>
        <p className="mb-3 text-xs text-slate-400">
          Scope: tenant <span className="text-slate-200">{tenantId}</span> · project{" "}
          <span className="text-slate-200">{normalizeProjectId(projectId)}</span>. Use the exact{" "}
          <code className="text-slate-300">dataset</code> string from this pipeline version readiness (see Versions →
          config <code className="text-slate-300">tasks</code>). Each project or app chooses its own dataset names; MLAir
          does not generate them here.
        </p>
        <div className="mb-3">
          <label className="text-xs text-slate-400">
            Readiness input dataset name
            <input
              value={readinessDatasetInput}
              onChange={(e) => setReadinessDatasetInput(e.target.value)}
              placeholder="Must match pipeline readiness inputs[].dataset"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
            />
          </label>
        </div>
        <TrainingGateFields
          trainingMode={trainingMode}
          onTrainingModeChange={setTrainingMode}
          requiredSize={requiredSize}
          onRequiredSizeChange={setRequiredSize}
          className="mb-3"
        />
        <div className="flex flex-wrap items-end gap-2">
            <button
              disabled={isChecking || !readinessDatasetInput.trim()}
              onClick={async () => {
                setGateError("");
                const datasetName = readinessDatasetInput.trim();
                if (!datasetName) {
                  setGateError("Enter the readiness input dataset name.");
                  return;
                }
                setIsChecking(true);
                try {
                  const required = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const res = await checkPipelineReadiness(tenantId, projectId, pipelineId, token, {
                    training_mode: trainingMode,
                    override_config: {
                      inputs: [{ dataset: datasetName, required_size: required }]
                    }
                  });
                  setGateResult(res);
                } catch (e: any) {
                  setGateError(String(e?.message || e));
                } finally {
                  setIsChecking(false);
                }
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-blue-900/20 disabled:opacity-60"
            >
              Check readiness
            </button>
            <button
              disabled={isRunning || !readinessDatasetInput.trim()}
              onClick={async () => {
                setGateError("");
                const datasetName = readinessDatasetInput.trim();
                if (!datasetName) {
                  setGateError("Enter the readiness input dataset name.");
                  return;
                }
                setIsRunning(true);
                try {
                  const required = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const res = await triggerPipelineRunWithGating(tenantId, projectId, pipelineId, token, {
                    pipeline_id: pipelineId,
                    idempotency_key: `ui-gating-${Date.now()}`,
                    priority: "normal",
                    max_parallel_tasks: 1,
                    training_mode: trainingMode,
                    override_config: { inputs: [{ dataset: datasetName, required_size: required }] }
                  });
                  if (res.run_id) {
                    router.push(`/runs/${res.run_id}`);
                  }
                } catch (e: any) {
                  setGateError(String(e?.message || e));
                } finally {
                  setIsRunning(false);
                }
              }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-900/20 disabled:opacity-60"
            >
              Run with gate
            </button>
        </div>
        {gateError && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{gateError}</div>
        )}
        {gateResult && (
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-2 text-xs text-slate-200">
              Ready: <span className={gateResult.ready ? "text-emerald-400" : "text-red-400"}>{String(gateResult.ready)}</span>
              {" · "}Mode: {gateResult.training_mode}
            </div>
            <div className="overflow-auto rounded-lg border border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Dataset</th>
                    <th className="px-2 py-1 text-left">Actual</th>
                    <th className="px-2 py-1 text-left">Required</th>
                    <th className="px-2 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(gateResult.details || []).map((d: any) => (
                    <tr key={`${d.dataset}-${d.role}`} className="border-t border-slate-800">
                      <td className="px-2 py-1">{d.dataset}</td>
                      <td className="px-2 py-1">{d.actual_size}</td>
                      <td className="px-2 py-1">{d.required_size}</td>
                      <td className="px-2 py-1">{d.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </RouteShell>
  );
}
