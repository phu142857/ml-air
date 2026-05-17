"use client"

import { useMemo } from "react"
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
import { Download, GitBranch, Cpu, CheckCircle2, FlaskConical, Rocket, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useChartTheme } from "@/hooks/use-chart-theme"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  estimateDagCanvasHeight,
  layoutDagPositions,
  truncateDagLabel,
} from "@/lib/pipeline-dag-layout"
import type { Pipeline, PipelineStage } from "@/lib/pipeline-types"

const stageTypeIcons = {
  ingest: Download,
  transform: GitBranch,
  train: Cpu,
  validate: FlaskConical,
  deploy: Rocket,
}

const stageTypeColors = {
  ingest: "from-sky-500 to-sky-600",
  transform: "from-violet-500 to-violet-600",
  train: "from-amber-500 to-amber-600",
  validate: "from-emerald-500 to-emerald-600",
  deploy: "from-pink-500 to-pink-600",
}

const statusColors = {
  idle: "border-border bg-card",
  running: "border-sky-500/50 bg-sky-500/10",
  success: "border-emerald-500/50 bg-emerald-500/10",
  failed: "border-red-500/50 bg-red-500/10",
  pending: "border-amber-500/50 bg-amber-500/10",
}

interface StageNodeData {
  stage: PipelineStage
  [key: string]: unknown
}

function StageNode({ data }: NodeProps<Node<StageNodeData>>) {
  const stage = data.stage as PipelineStage
  const Icon = stageTypeIcons[stage.type]
  const gradient = stageTypeColors[stage.type]
  const status = statusColors[stage.status]
  const displayName = truncateDagLabel(stage.name)
  const showTooltip = displayName !== stage.name.trim()

  const label = (
    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={stage.name}>
      {displayName}
    </span>
  )

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground/50 !border-border !w-2 !h-2"
      />
      <div
        className={cn(
          "w-[220px] max-w-[220px] rounded-lg border px-3 py-2.5 transition-all",
          status
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <div className={cn("shrink-0 rounded-md bg-gradient-to-br p-1.5", gradient)}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          {showTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{label}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm font-mono text-xs">
                {stage.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            label
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {stage.status === "running" ? (
            <Loader2 className="h-3 w-3 shrink-0 text-sky-400 animate-spin" />
          ) : stage.status === "success" ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
          ) : stage.status === "failed" ? (
            <div className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
          ) : stage.status === "pending" ? (
            <div className="h-3 w-3 shrink-0 rounded-full bg-amber-500/50 animate-pulse" />
          ) : (
            <div className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/60" />
          )}
          <span
            className={cn(
              "text-xs capitalize",
              stage.status === "success" && "text-emerald-400",
              stage.status === "running" && "text-sky-400",
              stage.status === "failed" && "text-red-400",
              stage.status === "pending" && "text-amber-400",
              stage.status === "idle" && "text-muted-foreground"
            )}
          >
            {stage.status}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground/50 !border-border !w-2 !h-2"
      />
    </>
  )
}

const nodeTypes = {
  stage: StageNode,
}

interface PipelineDAGProps {
  pipeline: Pipeline
}

export function PipelineDAG({ pipeline }: PipelineDAGProps) {
  const { flowBackground, flowEdgeStroke, flowColorMode } = useChartTheme()

  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : []

  const { nodes, edges, canvasHeight } = useMemo(() => {
    const stageMap = new Map(stages.map((s) => [s.id, s]))
    const nodeIds = stages.map((s) => s.id)
    const dagEdges = stages.flatMap((stage) =>
      (Array.isArray(stage.dependencies) ? stage.dependencies : []).map((depId) => ({
        source: depId,
        target: stage.id,
      })),
    )
    const positions = layoutDagPositions(nodeIds, dagEdges)

    const initialNodes: Node<StageNodeData>[] = stages.map((stage) => ({
      id: stage.id,
      type: "stage",
      position: positions[stage.id] ?? { x: 0, y: 0 },
      data: { stage },
    }))

    const initialEdges: Edge[] = stages.flatMap((stage) =>
      (Array.isArray(stage.dependencies) ? stage.dependencies : []).map((depId) => ({
        id: `${depId}-${stage.id}`,
        source: depId,
        target: stage.id,
        animated: stageMap.get(depId)?.status === "running",
        style: {
          stroke:
            stageMap.get(depId)?.status === "success"
              ? "#10b981"
              : stageMap.get(depId)?.status === "running"
                ? "#0ea5e9"
                : flowEdgeStroke,
          strokeWidth: 2,
        },
      }))
    )

    const canvasHeight = estimateDagCanvasHeight(nodeIds, dagEdges, { minHeight: 260 })

    return { nodes: initialNodes, edges: initialEdges, canvasHeight }
  }, [stages, flowEdgeStroke])

  const [nodesState] = useNodesState(nodes)
  const [edgesState] = useEdgesState(edges)

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="w-full overflow-hidden rounded-lg border border-border bg-muted/30"
        style={{ height: canvasHeight }}
      >
        <ReactFlow
          nodes={nodesState}
          edges={edgesState}
          nodeTypes={nodeTypes}
          colorMode={flowColorMode}
          defaultMarkerColor={flowEdgeStroke}
          fitView
          fitViewOptions={{ padding: 0.35, minZoom: 0.4, maxZoom: 1.2 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
        >
          <Background color={flowBackground} gap={16} size={1} />
          <Controls showInteractive={false} className="!shadow-sm" />
        </ReactFlow>
      </div>
    </TooltipProvider>
  )
}
