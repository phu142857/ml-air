"use client"

import { useEffect, useMemo } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Database, GitBranch, Box, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { layoutDagPositions } from "@/lib/pipeline-dag-layout"
import { useChartTheme } from "@/hooks/use-chart-theme"
import { dagFlowEdgeTypes, type DagFlowEdgeData } from "@/components/mlops/dag-flow-edge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type LineageNodeKind = "dataset" | "task" | "model" | "artifact"

export type LineageGraphNode = {
  id: string
  kind: LineageNodeKind
  label: string
  subtitle?: string
  detail?: string
}

export type LineageGraphEdge = {
  id: string
  source: string
  target: string
  label?: string
}

const kindConfig: Record<
  LineageNodeKind,
  {
    icon: typeof Database
    label: string
    accent: string
    border: string
    iconWrap: string
    minimap: string
  }
> = {
  dataset: {
    icon: Database,
    label: "Dataset",
    accent: "bg-[color:var(--status-success)]",
    border: "border-[color:var(--status-success-border)]",
    iconWrap: "bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
    minimap: "#7cb518",
  },
  task: {
    icon: GitBranch,
    label: "Task",
    accent: "bg-primary",
    border: "border-primary/45",
    iconWrap: "bg-primary/15 text-primary",
    minimap: "#0ea5e9",
  },
  model: {
    icon: Box,
    label: "Model",
    accent: "bg-[color:var(--status-pending)]",
    border: "border-[color:var(--status-pending-border)]",
    iconWrap: "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
    minimap: "#f59e0b",
  },
  artifact: {
    icon: Layers,
    label: "Artifact",
    accent: "bg-muted-foreground",
    border: "border-border",
    iconWrap: "bg-muted text-foreground",
    minimap: "#71717a",
  },
}

interface LineageNodeData {
  node: LineageGraphNode
  sourceHandleCount: number
  targetHandleCount: number
  [key: string]: unknown
}

function truncate(text: string, max = 28): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function handleTopPercent(index: number, count: number): string {
  if (count <= 1) return "50%"
  // Keep handles inside the card body (12%–88%).
  const t = (index + 1) / (count + 1)
  return `${12 + t * 76}%`
}

function LineageFlowNode({ data }: NodeProps<Node<LineageNodeData>>) {
  const node = data.node
  const config = kindConfig[node.kind]
  const Icon = config.icon
  const title = truncate(node.label, node.kind === "task" ? 22 : 26)
  const showTip = title !== node.label.trim() || Boolean(node.detail)
  const sourceCount = Math.max(1, data.sourceHandleCount || 1)
  const targetCount = Math.max(1, data.targetHandleCount || 1)

  const body = (
    <div
      className={cn(
        "relative flex w-[220px] overflow-hidden rounded-md border-2 bg-card shadow-sm",
        "transition-[box-shadow,border-color] hover:shadow-md",
        config.border,
      )}
    >
      <div className={cn("w-1.5 shrink-0", config.accent)} aria-hidden />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-2">
          <div className={cn("rounded-md p-1", config.iconWrap)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
            {config.label}
          </span>
        </div>
        <div className="truncate text-[13px] font-semibold leading-snug text-foreground" title={node.label}>
          {title}
        </div>
        {node.subtitle ? (
          <div className="mt-1 truncate font-mono text-[11px] font-medium text-foreground/65">{node.subtitle}</div>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      {Array.from({ length: targetCount }, (_, i) => (
        <Handle
          key={`in-${i}`}
          id={`in-${i}`}
          type="target"
          position={Position.Left}
          style={{ top: handleTopPercent(i, targetCount) }}
          className="!-left-1.5 !h-2.5 !w-2.5 !border-2 !border-background !bg-foreground"
        />
      ))}
      {showTip ? (
        <Tooltip>
          <TooltipTrigger asChild>{body}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm space-y-1 font-mono text-xs">
            <div className="font-sans font-semibold">{node.label}</div>
            {node.subtitle ? <div>{node.subtitle}</div> : null}
            {node.detail ? <div className="text-muted-foreground">{node.detail}</div> : null}
          </TooltipContent>
        </Tooltip>
      ) : (
        body
      )}
      {Array.from({ length: sourceCount }, (_, i) => (
        <Handle
          key={`out-${i}`}
          id={`out-${i}`}
          type="source"
          position={Position.Right}
          style={{ top: handleTopPercent(i, sourceCount) }}
          className="!-right-1.5 !h-2.5 !w-2.5 !border-2 !border-background !bg-foreground"
        />
      ))}
    </>
  )
}

const nodeTypes = {
  lineage: LineageFlowNode,
}

/** Spread sibling edges: negative → positive so the middle stays near 0. */
function fanOffset(index: number, count: number): number {
  if (count <= 1) return 0
  const mid = (count - 1) / 2
  const step = Math.min(42, 18 + count * 2)
  return (index - mid) * step
}

function bendForFan(count: number): number {
  if (count <= 1) return 0.28
  return Math.min(0.48, 0.26 + count * 0.02)
}

function barycenterOrder(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
  positions: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  // Re-pack Y within each layer using neighbor barycenters to reduce crossings.
  const layerOf = new Map<string, number>()
  const xToLayer = new Map<number, number>()
  const xs = [...new Set(Object.values(positions).map((p) => p.x))].sort((a, b) => a - b)
  xs.forEach((x, i) => xToLayer.set(x, i))
  for (const id of nodeIds) {
    layerOf.set(id, xToLayer.get(positions[id]?.x ?? 0) ?? 0)
  }

  const byLayer = new Map<number, string[]>()
  for (const id of nodeIds) {
    const L = layerOf.get(id) ?? 0
    if (!byLayer.has(L)) byLayer.set(L, [])
    byLayer.get(L)!.push(id)
  }

  const yOf = new Map(nodeIds.map((id) => [id, positions[id]?.y ?? 0]))
  const nodeGap = 152

  for (let pass = 0; pass < 2; pass++) {
    const layers = [...byLayer.keys()].sort((a, b) => a - b)
    const order = pass % 2 === 0 ? layers : [...layers].reverse()
    for (const L of order) {
      const ids = byLayer.get(L) || []
      const scored = ids.map((id) => {
        const nbrs =
          pass % 2 === 0
            ? edges.filter((e) => e.target === id).map((e) => yOf.get(e.source) ?? 0)
            : edges.filter((e) => e.source === id).map((e) => yOf.get(e.target) ?? 0)
        const bary = nbrs.length ? nbrs.reduce((a, b) => a + b, 0) / nbrs.length : (yOf.get(id) ?? 0)
        return { id, bary }
      })
      scored.sort((a, b) => a.bary - b.bary || a.id.localeCompare(b.id))
      scored.forEach((row, i) => yOf.set(row.id, i * nodeGap))
    }
  }

  const out: Record<string, { x: number; y: number }> = {}
  for (const id of nodeIds) {
    out[id] = { x: positions[id]?.x ?? 0, y: yOf.get(id) ?? 0 }
  }
  return out
}

function toFlow(
  nodes: LineageGraphNode[],
  edges: LineageGraphEdge[],
): { nodes: Node<LineageNodeData>[]; edges: Edge<DagFlowEdgeData>[] } {
  const ids = nodes.map((n) => n.id)
  const dagEdges = edges.map((e) => ({ source: e.source, target: e.target }))
  const rawPositions = layoutDagPositions(ids, dagEdges, { layerGap: 360, nodeGap: 152 })
  const positions = barycenterOrder(ids, dagEdges, rawPositions)

  const outBuckets = new Map<string, LineageGraphEdge[]>()
  const inBuckets = new Map<string, LineageGraphEdge[]>()
  for (const e of edges) {
    if (!outBuckets.has(e.source)) outBuckets.set(e.source, [])
    if (!inBuckets.has(e.target)) inBuckets.set(e.target, [])
    outBuckets.get(e.source)!.push(e)
    inBuckets.get(e.target)!.push(e)
  }

  // Stable order within a node: prefer target/source Y so handles align with destinations.
  for (const [, list] of outBuckets) {
    list.sort((a, b) => (positions[a.target]?.y ?? 0) - (positions[b.target]?.y ?? 0) || a.id.localeCompare(b.id))
  }
  for (const [, list] of inBuckets) {
    list.sort((a, b) => (positions[a.source]?.y ?? 0) - (positions[b.source]?.y ?? 0) || a.id.localeCompare(b.id))
  }

  const outIndex = new Map<string, number>()
  const inIndex = new Map<string, number>()
  for (const [, list] of outBuckets) {
    list.forEach((e, i) => outIndex.set(e.id, i))
  }
  for (const [, list] of inBuckets) {
    list.forEach((e, i) => inIndex.set(e.id, i))
  }

  const rfNodes: Node<LineageNodeData>[] = nodes.map((n) => ({
    id: n.id,
    type: "lineage",
    position: positions[n.id] ?? { x: 0, y: 0 },
    data: {
      node: n,
      sourceHandleCount: Math.max(1, outBuckets.get(n.id)?.length ?? 0),
      targetHandleCount: Math.max(1, inBuckets.get(n.id)?.length ?? 0),
    },
  }))

  const rfEdges: Edge<DagFlowEdgeData>[] = edges.map((e) => {
    const oi = outIndex.get(e.id) ?? 0
    const ii = inIndex.get(e.id) ?? 0
    const outCount = outBuckets.get(e.source)?.length ?? 1
    const inCount = inBuckets.get(e.target)?.length ?? 1
    const fan = (fanOffset(oi, outCount) + fanOffset(ii, inCount)) / 2
    const curvature = (bendForFan(outCount) + bendForFan(inCount)) / 2
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: `out-${oi}`,
      targetHandle: `in-${ii}`,
      type: "dag",
      animated: false,
      // Stroke omitted on purpose — DagFlowEdge tracks theme live (same as pipeline DAG defaults).
      data: { label: e.label, curvature, fan, fanned: true },
      style: { strokeWidth: 2.25 },
    }
  })

  return { nodes: rfNodes, edges: rfEdges }
}

export function LineageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-xs font-semibold text-foreground">Legend</span>
      {(Object.keys(kindConfig) as LineageNodeKind[]).map((kind) => {
        const config = kindConfig[kind]
        const Icon = config.icon
        return (
          <div key={kind} className="flex items-center gap-2">
            <div className={cn("flex h-6 items-center gap-1.5 rounded border-2 bg-card px-1.5", config.border)}>
              <span className={cn("h-3 w-1 rounded-sm", config.accent)} />
              <Icon className="h-3 w-3 text-foreground" strokeWidth={2} />
            </div>
            <span className="text-xs font-medium text-foreground/80">{config.label}</span>
          </div>
        )
      })}
    </div>
  )
}

type LineageGraphProps = {
  nodes: LineageGraphNode[]
  edges: LineageGraphEdge[]
  className?: string
}

export function LineageGraph({ nodes, edges, className }: LineageGraphProps) {
  const { flowColorMode } = useChartTheme()
  const flow = useMemo(() => toFlow(nodes, edges), [nodes, edges])
  const [rfNodes, setNodes, onNodesChange] = useNodesState(flow.nodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(flow.edges)

  useEffect(() => {
    setNodes(flow.nodes)
    setEdges(flow.edges)
  }, [flow, setNodes, setEdges])

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("lineage-flow mlair-dag-flow relative h-full w-full bg-muted/40", className)}>
        <ReactFlow
          className="h-full w-full"
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={dagFlowEdgeTypes}
          colorMode={flowColorMode}
          fitView
          fitViewOptions={{ padding: 0.3, minZoom: 0.35, maxZoom: 1.15 }}
          minZoom={0.2}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          edgesFocusable
          elevateEdgesOnSelect
          panOnScroll
          selectionOnDrag={false}
        >
          <Background
            id="lineage-grid"
            variant={BackgroundVariant.Lines}
            gap={28}
            size={1}
            color="color-mix(in srgb, var(--foreground) 10%, transparent)"
          />
          <Controls
            showInteractive={false}
            className="!overflow-hidden !rounded-md !border-2 !border-border !bg-card !shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground [&>button:hover]:!bg-muted"
          />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            maskColor="color-mix(in srgb, var(--background) 55%, transparent)"
            className="!overflow-hidden !rounded-md !border-2 !border-border !bg-card !shadow-sm"
            nodeColor={(n) => {
              const kind = (n.data as LineageNodeData | undefined)?.node?.kind
              return kind ? kindConfig[kind].minimap : "var(--muted-foreground)"
            }}
          />
        </ReactFlow>
      </div>
    </TooltipProvider>
  )
}

/** Short operator-style label from `runId:taskKey` or raw task id. */
export function taskDisplayName(taskId: string): { label: string; detail: string } {
  const raw = taskId.trim()
  const idx = raw.lastIndexOf(":")
  if (idx > 0 && idx < raw.length - 1) {
    return { label: raw.slice(idx + 1), detail: raw }
  }
  return { label: raw.length > 24 ? `${raw.slice(0, 22)}…` : raw, detail: raw }
}

export function inferDatasetKind(name: string): LineageNodeKind {
  const n = name.toLowerCase()
  if (/(^|[_-])model([_-]|$)/.test(n) || n.includes("checkpoint") || n.includes("weights")) {
    return "model"
  }
  if (n.includes("metric") || n.includes("eval") || n.includes("report") || n.includes("artifact")) {
    return "artifact"
  }
  return "dataset"
}
