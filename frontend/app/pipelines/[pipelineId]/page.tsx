"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { DagView } from "@/components/pipeline/dag-view";
import { fetchPipelineDag } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

export default function PipelineDetailPage() {
  const router = useRouter();
  const params = useParams<{ pipelineId: string }>();
  const pipelineId = params.pipelineId;
  const { tenantId, projectId, token } = useAppContext();

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
          className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
          onClick={() => router.push("/pipelines")}
        >
          Back to Pipelines
        </button>
        <Link
          href={`/pipelines/${encodeURIComponent(pipelineId)}/versions`}
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
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
    </RouteShell>
  );
}
