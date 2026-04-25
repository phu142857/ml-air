"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import ReactFlow, { Background, Controls, addEdge, useEdgesState, useNodesState, type Connection } from "reactflow";
import "reactflow/dist/style.css";
import { RouteShell } from "@/components/layout/route-shell";
import { fetchDatasetRuns, fetchDatasetVersion, fetchLineageForRun, fetchLineageNeighborhood } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

function LineagePageInner() {
  const { tenantId, projectId, token } = useAppContext();
  const sp = useSearchParams();
  const runId = sp.get("runId") || "";
  const initialCenter = sp.get("datasetVersionId") || "";
  const [center, setCenter] = useState(initialCenter);
  const [selectedVersionId, setSelectedVersionId] = useState(initialCenter);

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
  const selectedVersion = useQuery({
    queryKey: ["dataset-version", selectedVersionId, tenantId, projectId],
    queryFn: () => fetchDatasetVersion(tenantId, projectId, selectedVersionId, token),
    enabled: Boolean(selectedVersionId && token)
  });
  const datasetRuns = useQuery({
    queryKey: ["dataset-runs", selectedVersion.data?.dataset_id, tenantId, projectId],
    queryFn: () => fetchDatasetRuns(tenantId, projectId, selectedVersion.data!.dataset_id, token, 20),
    enabled: Boolean(selectedVersion.data?.dataset_id && token)
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
            data: { label: `${e.input_dataset_name || "dataset"}:${e.input_version || e.input_version_id.slice(0, 8)}` }
          });
        }
        if (e.output_version_id) {
          nmap.set(e.output_version_id, {
            id: e.output_version_id,
            position: pos(),
            data: { label: `${e.output_dataset_name || "dataset"}:${e.output_version || e.output_version_id.slice(0, 8)}` }
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
      const nodeMeta = new Map(
        (neighborhood.data.dataset_versions || []).map((v) => [v.version_id, `${v.dataset_name}:${v.version}`] as const)
      );
      for (const v of neighborhood.data.dataset_version_ids || []) {
        nmap.set(v, { id: v, position: pos(), data: { label: nodeMeta.get(v) || v.slice(0, 8) } });
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

  const highlighted = useMemo(() => {
    if (!selectedVersionId) return { nodes, edges };
    const neighborIds = new Set<string>([selectedVersionId]);
    for (const e of edges) {
      if (e.source === selectedVersionId) neighborIds.add(e.target);
      if (e.target === selectedVersionId) neighborIds.add(e.source);
    }
    return {
      nodes: nodes.map((n) => ({
        ...n,
        style: neighborIds.has(n.id) ? undefined : { opacity: 0.35 },
        selected: n.id === selectedVersionId
      })),
      edges: edges.map((e) => ({
        ...e,
        animated: e.source === selectedVersionId || e.target === selectedVersionId,
        style: e.source === selectedVersionId || e.target === selectedVersionId ? undefined : { opacity: 0.2 }
      }))
    };
  }, [nodes, edges, selectedVersionId]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: `${c.source}-${c.target}` }, eds)),
    [setEdges]
  );

  return (
    <RouteShell activeNav="Lineage" title="Data lineage" subtitle="Dataset versions and task edges">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            nodes={highlighted.nodes}
            edges={highlighted.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedVersionId(node.id)}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {runId && <p className="text-xs text-slate-500">Run-scoped: {runId}</p>}
        </div>
        <aside className="flex h-[480px] flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3">
          <h3 className="text-sm font-semibold text-slate-100">Dataset detail</h3>
          {!selectedVersionId && <p className="text-xs text-slate-400">Click a node to view detail.</p>}
          {selectedVersionId && (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
                <p><span className="text-slate-500">version_id:</span> {selectedVersionId}</p>
                <p><span className="text-slate-500">dataset:</span> {selectedVersion.data?.dataset_name || "-"}</p>
                <p><span className="text-slate-500">version:</span> {selectedVersion.data?.version || "-"}</p>
                <p className="truncate"><span className="text-slate-500">uri:</span> {selectedVersion.data?.uri || "-"}</p>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-200">Run history</p>
                <div className="space-y-2">
                  {(datasetRuns.data?.items || []).map((r) => (
                    <a
                      key={r.run_id}
                      href={`/runs/${r.run_id}`}
                      className="block rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
                    >
                      <p className="font-mono">{r.run_id.slice(0, 12)}...</p>
                      <p className="text-slate-500">{r.pipeline_id} • {r.status}</p>
                    </a>
                  ))}
                  {!datasetRuns.data?.items?.length && (
                    <p className="text-xs text-slate-500">No run history for this dataset.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
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
