"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Network, Database, GitBranch, Box, Layers, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import {
  fetchDatasetVersions,
  fetchLineageForRun,
  fetchLineageNeighborhood,
  type DatasetVersionItem,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"

const nodeTypeConfig = {
  dataset: { icon: Database, color: "from-emerald-500 to-emerald-600", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  pipeline: { icon: GitBranch, color: "from-amber-500 to-amber-600", border: "border-amber-500/30", bg: "bg-amber-500/10" },
  model: { icon: Box, color: "from-violet-500 to-violet-600", border: "border-violet-500/30", bg: "bg-violet-500/10" },
  feature: { icon: Layers, color: "from-sky-500 to-sky-600", border: "border-sky-500/30", bg: "bg-sky-500/10" },
}

type LineageGraphNode = {
  id: string
  type: keyof typeof nodeTypeConfig
  name: string
  version?: string
}

interface LineageNodeData {
  node: LineageGraphNode
  [key: string]: unknown
}

function LineageNode({ data }: NodeProps<Node<LineageNodeData>>) {
  const node = data.node
  const config = nodeTypeConfig[node.type]
  const Icon = config.icon

  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-zinc-800 !bg-zinc-600" />
      <div className={cn("min-w-[140px] rounded-lg border bg-zinc-900/80 px-4 py-3", config.border)}>
        <div className="mb-1 flex items-center gap-2">
          <div className={cn("rounded-md bg-gradient-to-br p-1.5", config.color)}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{node.type}</span>
        </div>
        <div className="text-sm font-medium text-zinc-200">{node.name}</div>
        {node.version ? <div className="mt-1 font-mono text-[10px] text-zinc-500">{node.version}</div> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-zinc-800 !bg-zinc-600" />
    </>
  )
}

const nodeTypes = {
  lineage: LineageNode,
}

type RfEdge = { id: string; source: string; target: string }

function dvId(versionId: string) {
  return `dv:${versionId}`
}

function taskNodeId(taskId: string) {
  return `task:${taskId}`
}

function versionMeta(
  versionId: string,
  versions: DatasetVersionItem[] | undefined,
): { name: string; version?: string } {
  const row = versions?.find((v) => v.version_id === versionId)
  if (row) {
    const name = String(row.dataset_name || row.dataset_id || versionId).trim() || versionId
    return { name, version: row.version || undefined }
  }
  const short = versionId.length > 18 ? `${versionId.slice(0, 16)}…` : versionId
  return { name: short }
}

function layerDepth(nodeIds: string[], edges: Array<{ source: string; target: string }>): Map<string, number> {
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const id of nodeIds) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of edges) {
    if (!adj.has(e.source) || !indeg.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const depth = new Map<string, number>()
  const rem = new Map(indeg)
  let frontier = nodeIds.filter((id) => (rem.get(id) ?? 0) === 0)
  let d = 0
  while (frontier.length && d < 24) {
    const next = new Set<string>()
    for (const u of frontier) {
      if (depth.has(u)) continue
      depth.set(u, d)
      for (const v of adj.get(u) || []) {
        rem.set(v, (rem.get(v) ?? 1) - 1)
        if ((rem.get(v) ?? 0) === 0) next.add(v)
      }
    }
    frontier = [...next]
    d++
  }
  let i = 0
  for (const id of nodeIds) {
    if (!depth.has(id)) depth.set(id, d + (i++ % 3))
  }
  return depth
}

function layoutPositions(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
): Record<string, { x: number; y: number }> {
  const layers = layerDepth(nodeIds, edges)
  const byLayer = new Map<number, string[]>()
  for (const id of nodeIds) {
    const L = layers.get(id) ?? 0
    if (!byLayer.has(L)) byLayer.set(L, [])
    byLayer.get(L)!.push(id)
  }
  const pos: Record<string, { x: number; y: number }> = {}
  for (const [L, list] of byLayer) {
    list.forEach((id, i) => {
      pos[id] = { x: L * 300, y: i * 120 }
    })
  }
  return pos
}

function buildFromRunLineage(
  edges: Array<{
    edge_id: string
    task_id: string
    input_version_id: string | null
    output_version_id: string | null
    input_dataset_name?: string | null
    output_dataset_name?: string | null
    input_version?: string | null
    output_version?: string | null
  }>,
  versions: DatasetVersionItem[] | undefined,
): { nodes: LineageGraphNode[]; rfEdges: RfEdge[] } {
  const nodeMap = new Map<string, LineageGraphNode>()
  const rfEdges: RfEdge[] = []
  const seen = new Set<string>()

  const addDv = (vid: string | null, name: string | null | undefined, ver: string | null | undefined) => {
    if (!vid) return
    const id = dvId(vid)
    if (nodeMap.has(id)) return
    const meta = versionMeta(vid, versions)
    nodeMap.set(id, {
      id,
      type: "dataset",
      name: name?.trim() || meta.name,
      version: ver?.trim() || meta.version,
    })
  }

  for (const e of edges) {
    addDv(e.input_version_id, e.input_dataset_name, e.input_version)
    addDv(e.output_version_id, e.output_dataset_name, e.output_version)
    const tid = taskNodeId(e.task_id)
    if (!nodeMap.has(tid)) {
      nodeMap.set(tid, { id: tid, type: "pipeline", name: e.task_id })
    }
    if (e.input_version_id) {
      const key = `${e.edge_id}-in`
      if (!seen.has(key)) {
        seen.add(key)
        rfEdges.push({ id: key, source: dvId(e.input_version_id), target: tid })
      }
    }
    if (e.output_version_id) {
      const key = `${e.edge_id}-out`
      if (!seen.has(key)) {
        seen.add(key)
        rfEdges.push({ id: key, source: tid, target: dvId(e.output_version_id) })
      }
    }
  }

  return { nodes: [...nodeMap.values()], rfEdges }
}

function buildFromNeighborhood(
  edges: Array<{
    edge_id: string
    run_id: string
    task_id: string
    input_dataset_version_id: string | null
    output_dataset_version_id: string | null
  }>,
  versions: DatasetVersionItem[] | undefined,
): { nodes: LineageGraphNode[]; rfEdges: RfEdge[] } {
  const mapped = edges.map((e) => ({
    edge_id: e.edge_id,
    task_id: e.task_id,
    input_version_id: e.input_dataset_version_id,
    output_version_id: e.output_dataset_version_id,
    input_dataset_name: null as string | null,
    output_dataset_name: null as string | null,
    input_version: null as string | null,
    output_version: null as string | null,
  }))
  return buildFromRunLineage(mapped, versions)
}

function toReactFlow(nodes: LineageGraphNode[], rfEdges: RfEdge[]): { nodes: Node<LineageNodeData>[]; edges: Edge[] } {
  const ids = nodes.map((n) => n.id)
  const pos = layoutPositions(
    ids,
    rfEdges.map((e) => ({ source: e.source, target: e.target })),
  )
  const rfNodes: Node<LineageNodeData>[] = nodes.map((n) => ({
    id: n.id,
    type: "lineage",
    position: pos[n.id] || { x: 0, y: 0 },
    data: { node: n },
  }))
  const rfEdgesOut: Edge[] = rfEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: "#3f3f46", strokeWidth: 2 },
  }))
  return { nodes: rfNodes, edges: rfEdgesOut }
}

function pickLatestVersionId(items: DatasetVersionItem[]): string | null {
  if (!items.length) return null
  const sorted = [...items].sort((a, b) => {
    const ta = Date.parse(String(a.created_at || "")) || 0
    const tb = Date.parse(String(b.created_at || "")) || 0
    return tb - ta
  })
  return sorted[0]?.version_id ?? null
}

function LineagePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tenantId, projectId, token } = useAppContext()
  const canScope = tenantId !== "all" && projectId !== "all"
  const enabled = Boolean(token?.trim()) && canScope

  const runParam = (searchParams.get("run") || "").trim()
  const datasetVersionParam = (
    searchParams.get("datasetVersion") ||
    searchParams.get("datasetVersionId") ||
    ""
  ).trim()
  const datasetIdParam = (searchParams.get("datasetId") || "").trim()
  const resolvingDatasetId = Boolean(datasetIdParam) && !runParam && !datasetVersionParam && enabled

  const resolveDatasetQuery = useQuery({
    queryKey: ["lineage-resolve-dataset", tenantId, projectId, datasetIdParam] as const,
    queryFn: async () => {
      const { items } = await fetchDatasetVersions(tenantId, projectId, datasetIdParam, token)
      return pickLatestVersionId(items)
    },
    enabled: resolvingDatasetId,
  })

  useEffect(() => {
    if (!resolvingDatasetId) return
    if (resolveDatasetQuery.isSuccess) {
      const vid = resolveDatasetQuery.data
      if (vid) {
        router.replace(`/lineage?datasetVersion=${encodeURIComponent(vid)}`)
      } else {
        router.replace(`/datasets/${encodeURIComponent(datasetIdParam)}`)
      }
    } else if (resolveDatasetQuery.isError) {
      router.replace(`/datasets/${encodeURIComponent(datasetIdParam)}`)
    }
  }, [
    resolvingDatasetId,
    resolveDatasetQuery.isSuccess,
    resolveDatasetQuery.isError,
    resolveDatasetQuery.data,
    datasetIdParam,
    router,
  ])

  const [runInput, setRunInput] = useState(runParam)
  const [dvInput, setDvInput] = useState(datasetVersionParam)

  useEffect(() => {
    setRunInput(runParam)
    setDvInput(datasetVersionParam)
  }, [runParam, datasetVersionParam])

  const mode: "run" | "datasetVersion" | null = runParam ? "run" : datasetVersionParam ? "datasetVersion" : null

  const lineageRunQuery = useQuery({
    queryKey: mlairKeys.lineage.run(tenantId, projectId, runParam),
    queryFn: () => fetchLineageForRun(tenantId, projectId, runParam, token),
    enabled: enabled && mode === "run",
  })

  const lineageNbQuery = useQuery({
    queryKey: [...mlairKeys.lineage.neighborhood(tenantId, projectId, datasetVersionParam), 2, "both"] as const,
    queryFn: () => fetchLineageNeighborhood(tenantId, projectId, token, datasetVersionParam, 2, "both"),
    enabled: enabled && mode === "datasetVersion",
  })

  const graph = useMemo(() => {
    if (mode === "run" && lineageRunQuery.data) {
      return buildFromRunLineage(lineageRunQuery.data.edges, undefined)
    }
    if (mode === "datasetVersion" && lineageNbQuery.data) {
      return buildFromNeighborhood(lineageNbQuery.data.edges, lineageNbQuery.data.dataset_versions)
    }
    return { nodes: [] as LineageGraphNode[], rfEdges: [] as RfEdge[] }
  }, [mode, lineageRunQuery.data, lineageNbQuery.data])

  const rf = useMemo(() => toReactFlow(graph.nodes, graph.rfEdges), [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState(rf.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rf.edges)

  useEffect(() => {
    setNodes(rf.nodes)
    setEdges(rf.edges)
  }, [rf, setNodes, setEdges])

  const activeError =
    mode === "run"
      ? lineageRunQuery.isError
        ? lineageRunQuery.error
        : null
      : mode === "datasetVersion"
        ? lineageNbQuery.isError
          ? lineageNbQuery.error
          : null
        : null

  const activeLoading =
    resolvingDatasetId && resolveDatasetQuery.isLoading
      ? true
      : mode === "run"
        ? lineageRunQuery.isLoading
        : mode === "datasetVersion"
          ? lineageNbQuery.isLoading
          : false

  const applyRun = () => {
    const r = runInput.trim()
    if (!r) return
    router.push(`/lineage?run=${encodeURIComponent(r)}`)
  }

  const applyDatasetVersion = () => {
    const v = dvInput.trim()
    if (!v) return
    router.push(`/lineage?datasetVersion=${encodeURIComponent(v)}`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-pink-500/20 bg-gradient-to-br from-pink-500/20 to-pink-600/10">
              <Network className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Lineage</h1>
              <p className="text-xs text-zinc-500">Dataset version graph from MLAir lineage edges</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-500">Run ID</Label>
              <div className="flex gap-2">
                <Input
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                  placeholder="run_…"
                  className="h-8 min-w-[200px] border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-100"
                />
                <Button type="button" size="sm" className="h-8 shrink-0" onClick={applyRun} disabled={!runInput.trim()}>
                  Load
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-zinc-500">Dataset version ID</Label>
              <div className="flex gap-2">
                <Input
                  value={dvInput}
                  onChange={(e) => setDvInput(e.target.value)}
                  placeholder="dataset_versions.version_id"
                  className="h-8 min-w-[220px] border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-100"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0"
                  onClick={applyDatasetVersion}
                  disabled={!dvInput.trim()}
                >
                  Load
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!canScope ? (
        <div className="border-b border-zinc-800 bg-amber-500/10 px-6 py-2 text-xs text-amber-100">
          Select a specific tenant and project to load lineage from the API.
        </div>
      ) : null}

      {activeError ? (
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-xs text-red-200">
          {formatApiClientError(activeError)}
        </div>
      ) : null}

      {resolvingDatasetId && resolveDatasetQuery.isLoading ? (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Resolving latest version for dataset{" "}
          <span className="font-mono text-zinc-400">{datasetIdParam}</span>…
        </div>
      ) : null}

      {mode && activeLoading && !(resolvingDatasetId && resolveDatasetQuery.isLoading) ? (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading lineage…
        </div>
      ) : null}

      {mode && !activeLoading && graph.nodes.length === 0 && !activeError ? (
        <div className="border-b border-zinc-800 px-6 py-2 text-xs text-zinc-500">No lineage edges returned for this query.</div>
      ) : null}

      <div className="border-b border-zinc-800 bg-zinc-900/30 px-6 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <span className="text-xs text-zinc-500">Node types</span>
          {Object.entries(nodeTypeConfig).map(([type, config]) => {
            const Icon = config.icon
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className={cn("rounded bg-gradient-to-br p-1", config.color)}>
                  <Icon className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs capitalize text-zinc-400">{type}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-zinc-950">
        {!mode ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-500">
            Enter a run ID or dataset version ID above, use <span className="font-mono text-zinc-400">?datasetId=</span>{" "}
            for the latest version of a dataset, or open lineage from a run or dataset page.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.25}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#27272a" gap={20} size={1} />
            <Controls className="!rounded-lg !border-zinc-800 !bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700" />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}

export default function LineagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading lineage…
        </div>
      }
    >
      <LineagePageInner />
    </Suspense>
  )
}
