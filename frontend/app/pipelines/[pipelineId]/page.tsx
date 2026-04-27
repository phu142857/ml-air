"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { DagView } from "@/components/pipeline/dag-view";
import { checkPipelineReadiness, fetchPipelineDag, triggerPipelineRunWithGating } from "@/lib/api";
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

  const { data } = useQuery({
    queryKey: ["pipeline-dag", pipelineId],
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
        <h2 className="mb-3 text-sm font-semibold text-slate-200">DAG</h2>
        <DagView tasks={tasks} />
      </section>
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Readiness & Gating</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-400">
            Training mode
            <select
              value={trainingMode}
              onChange={(e) => setTrainingMode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
            >
              <option value="quick">quick</option>
              <option value="standard">standard</option>
              <option value="full">full</option>
            </select>
          </label>
          <label className="text-xs text-slate-400 md:col-span-2">
            Required rows (input dataset)
            <input
              value={requiredSize}
              onChange={(e) => setRequiredSize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              disabled={isChecking}
              onClick={async () => {
                setGateError("");
                setIsChecking(true);
                try {
                  const required = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const datasetName = `vetai_feedback_${projectId}`;
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
              disabled={isRunning}
              onClick={async () => {
                setGateError("");
                setIsRunning(true);
                try {
                  const required = Math.max(1, Number.parseInt(requiredSize || "0", 10) || 1);
                  const datasetName = `vetai_feedback_${projectId}`;
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
                <thead className="bg-slate-900 text-slate-400">
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
