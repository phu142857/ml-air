"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import ReactFlow, { Background, Controls, addEdge, useEdgesState, useNodesState, type Connection } from "reactflow";
import "reactflow/dist/style.css";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchLineageForRun, fetchLineageNeighborhood } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

function LineagePageInner() {
  const { tenantId, projectId, token } = useAppContext();
  const sp = useSearchParams();
  const runId = sp.get("runId") || "";
  const initialCenter = sp.get("datasetVersionId") || "";
  const [center, setCenter] = useState(initialCenter);

  const runLineage = useQuery({
    queryKey: ["lineage-run", runId, tenantId, projectId],
    queryFn: () => fetchLineageForRun(tenantId, projectId, runId, token),
    enabled: Boolean(runId && token)
  });
  const neighborhood = useQuery({
    queryKey: ["lineage-nb", center, tenantId, projectId],
    queryFn: () => fetchLineageNeighborhood(tenantId, projectId, token, center, 2, "both"),
    enabled: Boolean(center && token && !runId)
  });

  const built = useMemo(() => {
    let idx = 0;
    const pos = () => ({ x: (idx++ % 6) * 180, y: Math.floor(idx / 6) * 100 });
    if (runId && runLineage.data?.edges?.length) {
      const nmap = new Map<string, { id: string; position: { x: number; y: number }; data: { label: string } }>();
      const es: { id: string; source: string; target: string }[] = [];
      for (const e of runLineage.data.edges) {
        if (e.input_version_id) {
          nmap.set(e.input_version_id, {
            id: e.input_version_id,
            position: pos(),
            data: { label: e.input_version_id.slice(0, 8) }
          });
        }
        if (e.output_version_id) {
          nmap.set(e.output_version_id, {
            id: e.output_version_id,
            position: pos(),
            data: { label: e.output_version_id.slice(0, 8) }
          });
        }
        if (e.input_version_id && e.output_version_id) {
          es.push({ id: e.edge_id, source: e.input_version_id, target: e.output_version_id });
        }
      }
      return { nodes: Array.from(nmap.values()), edges: es };
    }
    if (!runId && neighborhood.data?.edges) {
      idx = 0;
      const nmap = new Map<string, { id: string; position: { x: number; y: number }; data: { label: string } }>();
      for (const v of neighborhood.data.dataset_version_ids || []) {
        nmap.set(v, { id: v, position: pos(), data: { label: v.slice(0, 8) } });
      }
      const es = (neighborhood.data.edges || [])
        .filter((e) => e.input_dataset_version_id && e.output_dataset_version_id)
        .map((e) => ({
          id: e.edge_id,
          source: e.input_dataset_version_id!,
          target: e.output_dataset_version_id!
        }));
      return { nodes: Array.from(nmap.values()), edges: es };
    }
    return {
      nodes: [] as { id: string; position: { x: number; y: number }; data: { label: string } }[],
      edges: [] as { id: string; source: string; target: string }[]
    };
  }, [runId, runLineage.data, neighborhood.data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);
  useEffect(() => {
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [built, setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `${c.source}-${c.target}` }, eds)),
    [setEdges]
  );

  return (
    <RouteShell activeNav="Lineage" title="Data lineage" subtitle="Dataset versions and task edges">
      <div className="flex flex-col gap-3">
        <input
          className="max-w-md rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200"
          placeholder="dataset version id (neighborhood, no runId)"
          value={center}
          onChange={(e) => setCenter(e.target.value)}
        />
        <div className="h-[480px] rounded-2xl border border-slate-700 bg-slate-900">
          <ReactFlow
            fitView
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {runId && <p className="text-xs text-slate-500">Run-scoped: {runId}</p>}
      </div>
    </RouteShell>
  );
}

export default function LineagePage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading lineage…</div>}>
      <LineagePageInner />
    </Suspense>
  );
}
