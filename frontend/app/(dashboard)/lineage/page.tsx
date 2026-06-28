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
import { ResourcePageHeader, ScopePinnedInline, MlopsEmptyState } from "@/components/mlops/layout"
import { cn, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { SCOPE_AGGREGATE_LINEAGE } from "@/lib/scope-messages"
import {
  fetchDatasetVersions,
  fetchLineageForRun,
  fetchLineageNeighborhood,
  type DatasetVersionItem,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useChartTheme } from "@/hooks/use-chart-theme"

const nodeTypeConfig = {
  dataset: {
    icon: Database,
    iconClass: "bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
    border: "border-[color:var(--status-success-border)]",
    bg: "bg-card",
  },
  pipeline: {
    icon: GitBranch,
    iconClass: "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
    border: "border-[color:var(--status-pending-border)]",
    bg: "bg-card",
  },
  model: {
    icon: Box,
    iconClass: "bg-primary/10 text-primary",
    border: "border-primary/30",
    bg: "bg-card",
  },
  feature: {
    icon: Layers,
    iconClass: "bg-muted text-foreground",
    border: "border-border/60",
    bg: "bg-card",
  },
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
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-border !bg-muted-foreground/50" />
      <div className={cn("min-w-[140px] rounded-xl border px-4 py-3 shadow-whisper", config.border, config.bg)}>
        <div className="mb-1 flex items-center gap-2">
          <div className={cn("rounded-lg p-1.5", config.iconClass)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{node.type}</span>
        </div>
        <div className="text-sm font-medium text-foreground">{node.name}</div>
        {node.version ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">{node.version}</div> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-border !bg-muted-foreground/50" />
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

function toReactFlow(
  nodes: LineageGraphNode[],
  rfEdges: RfEdge[],
  edgeStroke: string,
): { nodes: Node<LineageNodeData>[]; edges: Edge[] } {
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
    style: { stroke: edgeStroke, strokeWidth: 2 },
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
  const { flowBackground, flowEdgeStroke, flowColorMode } = useChartTheme()
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

  const rf = useMemo(() => toReactFlow(graph.nodes, graph.rfEdges, flowEdgeStroke), [graph, flowEdgeStroke])

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

  const runLoading = mode === "run" && (lineageRunQuery.isLoading || lineageRunQuery.isFetching)
  const dvLoading = mode === "datasetVersion" && (lineageNbQuery.isLoading || lineageNbQuery.isFetching)

  const loadBtnClass =
    "h-8 shrink-0 gap-2 border-border bg-card text-xs text-muted-foreground hover:text-foreground"

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Network}
        accent="zinc"
        title="Lineage"
      />

      <div className="page-toolbar">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Run ID</Label>
            <div className="flex gap-2">
              <Input
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                placeholder="run_…"
                className="h-8 min-w-[200px] border-border bg-card font-mono text-xs"
                disabled={!canScope}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={loadBtnClass}
                onClick={applyRun}
                disabled={!runInput.trim() || !canScope || runLoading}
              >
                {runLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dataset version ID</Label>
            <div className="flex gap-2">
              <Input
                value={dvInput}
                onChange={(e) => setDvInput(e.target.value)}
                placeholder="dataset_versions.version_id"
                className="h-8 min-w-[220px] border-border bg-card font-mono text-xs"
                disabled={!canScope}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={loadBtnClass}
                onClick={applyDatasetVersion}
                disabled={!dvInput.trim() || !canScope || dvLoading}
              >
                {dvLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="flex flex-wrap items-center gap-6">
          <span className="text-xs font-medium text-muted-foreground">Node types</span>
          {Object.entries(nodeTypeConfig).map(([type, config]) => {
            const Icon = config.icon
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className={cn("rounded-lg p-1", config.iconClass)}>
                  <Icon className="h-3 w-3" strokeWidth={1.75} />
                </div>
                <span className="text-xs capitalize text-muted-foreground">{type}</span>
              </div>
            )
          })}
        </div>
      </div>

      {activeError ? (
        <div className="shrink-0 border-b border-border bg-[color:var(--status-failed-bg)] px-6 py-2 text-xs text-destructive">
          {formatApiClientError(activeError)}
        </div>
      ) : null}

      {resolvingDatasetId && resolveDatasetQuery.isLoading ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Resolving latest version for dataset{" "}
          <span className="font-mono text-muted-foreground">{datasetIdParam}</span>…
        </div>
      ) : null}

      {mode && activeLoading && !(resolvingDatasetId && resolveDatasetQuery.isLoading) ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading lineage…
        </div>
      ) : null}

      {mode && !activeLoading && graph.nodes.length === 0 && !activeError ? (
        <div className="shrink-0 border-b border-border surface-muted px-6 py-4">
          <MlopsEmptyState
            icon={Network}
            title="No lineage edges"
            description="The API returned no graph nodes for this query."
            className="border-0 bg-transparent p-0"
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {!canScope ? (
          <div className="shrink-0 px-4 pt-4 sm:px-6">
            <ScopePinnedInline message={SCOPE_AGGREGATE_LINEAGE} />
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1 scroll-region">
        {!mode ? (
          <div className="flex h-full items-center justify-center p-8">
            <MlopsEmptyState
              icon={Network}
              title="No graph loaded"
              description="Enter a run ID or dataset version ID above, use ?datasetId= for the latest version of a dataset, or open lineage from a run or dataset page."
              className="max-w-lg border-0 bg-transparent"
            />
          </div>
        ) : (
          <ReactFlow
            className="h-full w-full"
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            colorMode={flowColorMode}
            defaultMarkerColor={flowEdgeStroke}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.25}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={flowBackground} gap={20} size={1} />
            <Controls className="!bg-card !border-border !rounded-lg [&>button]:!bg-muted [&>button]:!border-border [&>button]:!text-muted-foreground [&>button:hover]:!bg-accent" />
          </ReactFlow>
        )}
        </div>
      </div>
    </div>
  )
}

export default function LineagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading lineage…
        </div>
      }
    >
      <LineagePageInner />
    </Suspense>
  )
}
