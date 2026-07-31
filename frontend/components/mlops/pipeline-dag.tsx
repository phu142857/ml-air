"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
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
import { dagFlowEdgeTypes, type DagFlowEdgeData } from "@/components/mlops/dag-flow-edge"
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
import { buildTaskDetailHref } from "@/lib/task-detail-href"

export type PipelineDagTaskScope = {
  runId: string
  tenantId?: string
  projectId?: string
}

const stageTypeIcons = {
  ingest: Download,
  transform: GitBranch,
  train: Cpu,
  validate: FlaskConical,
  deploy: Rocket,
}

const stageTypeColors = {
  ingest: "bg-primary/15 text-primary",
  transform: "bg-muted text-foreground",
  train: "bg-primary/15 text-primary",
  validate: "bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
  deploy: "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
}

const statusColors = {
  idle: "border-border/60 bg-card",
  running: "border-primary/40 bg-primary/10",
  success: "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)]",
  failed: "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)]",
  pending: "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)]",
}

interface StageNodeData {
  stage: PipelineStage
  clickable?: boolean
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
          status,
          data.clickable && "cursor-pointer hover:shadow-sm"
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <div className={cn("shrink-0 rounded-lg p-1.5", gradient)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
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
            <Loader2 className="h-3 w-3 shrink-0 text-primary animate-spin" />
          ) : stage.status === "success" ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-[color:var(--status-success-fg)]" />
          ) : stage.status === "failed" ? (
            <div className="h-3 w-3 shrink-0 rounded-full bg-[color:var(--status-failed-fg)]" />
          ) : stage.status === "pending" ? (
            <div className="h-3 w-3 shrink-0 rounded-full bg-primary/50 animate-pulse" />
          ) : (
            <div className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/60" />
          )}
          <span
            className={cn(
              "text-xs capitalize",
              stage.status === "success" && "text-[color:var(--status-success-fg)]",
              stage.status === "running" && "text-primary",
              stage.status === "failed" && "text-[color:var(--status-failed-fg)]",
              stage.status === "pending" && "text-[color:var(--status-pending-fg)]",
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
  taskScope?: PipelineDagTaskScope
}

export function PipelineDAG({ pipeline, taskScope }: PipelineDAGProps) {
  const router = useRouter()
  const { flowBackground, flowColorMode } = useChartTheme()

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
      data: { stage, clickable: Boolean(taskScope?.runId?.trim()) },
    }))

    const initialEdges: Edge<DagFlowEdgeData>[] = stages.flatMap((stage) =>
      (Array.isArray(stage.dependencies) ? stage.dependencies : []).map((depId) => {
        const depStatus = stageMap.get(depId)?.status
        const accentStroke =
          depStatus === "success"
            ? "#10b981"
            : depStatus === "running"
              ? "#0ea5e9"
              : depStatus === "failed"
                ? "#ef4444"
                : undefined
        return {
          id: `${depId}-${stage.id}`,
          source: depId,
          target: stage.id,
          type: "dag",
          animated: false,
          data: accentStroke ? { accentStroke } : {},
          style: { strokeWidth: 2.25 },
        }
      }),
    )

    const canvasHeight = estimateDagCanvasHeight(nodeIds, dagEdges, { minHeight: 260 })

    return { nodes: initialNodes, edges: initialEdges, canvasHeight }
  }, [stages, taskScope?.runId])

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes)
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges)

  useEffect(() => {
    setNodes(nodes)
    setEdges(edges)
  }, [nodes, edges, setNodes, setEdges])

  const handleNodeClick = (_: React.MouseEvent, node: Node<StageNodeData>) => {
    if (!taskScope?.runId?.trim()) return
    const taskId = `${taskScope.runId}:${node.id}`
    router.push(
      buildTaskDetailHref(taskId, {
        tenant_id: taskScope.tenantId,
        project_id: taskScope.projectId,
        run_id: taskScope.runId,
      }),
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="mlair-dag-flow w-full overflow-hidden inset-surface"
        style={{ height: canvasHeight }}
      >
        <ReactFlow
          nodes={nodesState}
          edges={edgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={taskScope?.runId ? handleNodeClick : undefined}
          nodeTypes={nodeTypes}
          edgeTypes={dagFlowEdgeTypes}
          colorMode={flowColorMode}
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
