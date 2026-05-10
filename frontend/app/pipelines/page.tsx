"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DagView } from "@/components/pipeline/dag-view";
import { RouteShell } from "@/components/layout/route-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableShell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { fetchPipelineDag, fetchPipelines } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useAppContext } from "@/lib/app-context";
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style";

export default function PipelinesPage() {
  const router = useRouter();
  const { tenantId, projectId, token } = useAppContext();
  const [selectedPipeline, setSelectedPipeline] = useState("demo_pipeline");

  const { data } = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token)
  });
  const { data: dag } = useQuery({
    queryKey: mlairKeys.pipelines.dag(tenantId, projectId, selectedPipeline),
    queryFn: () => fetchPipelineDag(tenantId, projectId, selectedPipeline, token)
  });

  const tasks = useMemo(
    () => (dag?.nodes ?? []).map((node) => ({ task_id: node.id, status: node.status, attempt: 1 })),
    [dag]
  );

  return (
    <RouteShell
      activeNav="Pipelines"
      title="Pipelines"
      subtitle="Orchestration-first: DAG, replay, and advanced execution gate — not the primary lifecycle surface"
    >
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pipelines</CardTitle>
          </CardHeader>
          <CardContent>
          <DataTableShell>
          <DataTable className="text-sm">
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
                  className="interactive-row cursor-pointer border-t border-border"
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
                    className="px-3 py-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/pipelines/${encodeURIComponent(item.pipeline_id)}/versions`);
                    }}
                  >
                    <Button variant="ghost" className="px-2 py-1 text-xs">open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          </DataTableShell>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>DAG: {selectedPipeline}</CardTitle>
          </CardHeader>
          <CardContent>
          <DagView tasks={tasks} />
          </CardContent>
        </Card>
      </div>
    </RouteShell>
  );
}
