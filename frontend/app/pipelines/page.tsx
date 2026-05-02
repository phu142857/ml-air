"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DagView } from "@/components/pipeline/dag-view";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchPipelineDag, fetchPipelines } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style";

export default function PipelinesPage() {
  const router = useRouter();
  const { tenantId, projectId, token } = useAppContext();
  const [selectedPipeline, setSelectedPipeline] = useState("demo_pipeline");

  const { data } = useQuery({
    queryKey: ["pipelines", tenantId, projectId],
    queryFn: () => fetchPipelines(tenantId, projectId, token)
  });
  const { data: dag } = useQuery({
    queryKey: ["pipeline-dag", tenantId, projectId, selectedPipeline],
    queryFn: () => fetchPipelineDag(tenantId, projectId, selectedPipeline, token)
  });

  const tasks = useMemo(
    () => (dag?.nodes ?? []).map((node) => ({ task_id: node.id, status: node.status, attempt: 1 })),
    [dag]
  );

  return (
    <RouteShell activeNav="Pipelines" title="Pipelines" subtitle="Pipeline list and DAG view">
      <div className="grid grid-cols-2 gap-4">
        <div className="overflow-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Pipeline</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Runs</th>
                <th className="px-3 py-2 text-left">Versions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr
                  key={item.pipeline_id}
                  className="interactive-row cursor-pointer border-t border-slate-800"
                  onClick={() => {
                    setSelectedPipeline(item.pipeline_id);
                    router.push(`/pipelines/${item.pipeline_id}`);
                  }}
                >
                  <td className="px-3 py-2">{item.pipeline_id}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(item.latest_status)}`}>
                      {normalizeStatus(item.latest_status)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{item.total_runs}</td>
                  <td
                    className="px-3 py-2 text-blue-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/pipelines/${encodeURIComponent(item.pipeline_id)}/versions`);
                    }}
                  >
                    open
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
          <h2 className="mb-3 text-section font-semibold text-slate-200">DAG: {selectedPipeline}</h2>
          <DagView tasks={tasks} />
        </section>
      </div>
    </RouteShell>
  );
}
