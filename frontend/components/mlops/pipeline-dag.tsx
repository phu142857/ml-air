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

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground/50 !border-border !w-2 !h-2"
      />
      <div
        className={cn(
          "rounded-lg border px-4 py-3 min-w-[160px] transition-all",
          status
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("p-1.5 rounded-md bg-gradient-to-br", gradient)}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-foreground">{stage.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {stage.status === "running" ? (
            <Loader2 className="h-3 w-3 text-sky-400 animate-spin" />
          ) : stage.status === "success" ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : stage.status === "failed" ? (
            <div className="h-3 w-3 rounded-full bg-red-500" />
          ) : stage.status === "pending" ? (
            <div className="h-3 w-3 rounded-full bg-amber-500/50 animate-pulse" />
          ) : (
            <div className="h-3 w-3 rounded-full bg-muted-foreground/60" />
          )}
          <span className={cn(
            "text-xs capitalize",
            stage.status === "success" && "text-emerald-400",
            stage.status === "running" && "text-sky-400",
            stage.status === "failed" && "text-red-400",
            stage.status === "pending" && "text-amber-400",
            stage.status === "idle" && "text-muted-foreground"
          )}>
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

  const { nodes, edges } = useMemo(() => {
    const stageMap = new Map(pipeline.stages.map((s) => [s.id, s]))
    
    const initialNodes: Node<StageNodeData>[] = pipeline.stages.map((stage, index) => ({
      id: stage.id,
      type: "stage",
      position: { x: index * 220, y: 50 },
      data: { stage },
    }))

    const initialEdges: Edge[] = pipeline.stages.flatMap((stage) =>
      stage.dependencies.map((depId) => ({
        id: `${depId}-${stage.id}`,
        source: depId,
        target: stage.id,
        animated: stageMap.get(depId)?.status === "running",
        style: {
          stroke: stageMap.get(depId)?.status === "success"
            ? "#10b981"
            : stageMap.get(depId)?.status === "running"
            ? "#0ea5e9"
            : flowEdgeStroke,
          strokeWidth: 2,
        },
      }))
    )

    return { nodes: initialNodes, edges: initialEdges }
  }, [pipeline, flowEdgeStroke])

  const [nodesState] = useNodesState(nodes)
  const [edgesState] = useEdgesState(edges)

  return (
    <div className="h-[200px] w-full rounded-lg border border-border bg-muted/30 overflow-hidden">
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        nodeTypes={nodeTypes}
        colorMode={flowColorMode}
        defaultMarkerColor={flowEdgeStroke}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.5}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
      >
        <Background color={flowBackground} gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}
