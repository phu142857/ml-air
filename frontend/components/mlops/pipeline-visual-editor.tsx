"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { configToPreviewPipeline } from "@/lib/pipeline/normalize";
import type { NormalizedPipelineConfig, PipelineTaskConfig } from "@/lib/pipeline/types";
import { inferStageTypeFromLabel } from "@/lib/pipeline/infer-stage-type";
import { estimateDagCanvasHeight, layoutDagPositions } from "@/lib/pipeline-dag-layout";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/lib/pipeline-types";

type Props = {
  pipelineId: string;
  config: NormalizedPipelineConfig;
  onChange: (config: NormalizedPipelineConfig) => void;
  className?: string;
};

type EditorNodeData = {
  stage: PipelineStage;
  [key: string]: unknown;
};

function EditorStageNode({ data, selected }: NodeProps<Node<EditorNodeData>>) {
  const stage = data.stage;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-border !bg-muted-foreground/50" />
      <div
        className={cn(
          "w-[200px] rounded-lg border px-3 py-2 text-sm",
          selected ? "border-primary/50 bg-primary/10" : "border-border bg-card",
        )}
      >
        <div className="truncate font-medium text-foreground">{stage.name}</div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{stage.id}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-border !bg-muted-foreground/50" />
    </>
  );
}

const nodeTypes = { stage: EditorStageNode };

function edgesToDependsOn(edges: Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.target) || [];
    list.push(edge.source);
    map.set(edge.target, list);
  }
  return map;
}

function applyDependsOn(tasks: PipelineTaskConfig[], depends: Map<string, string[]>): PipelineTaskConfig[] {
  return tasks.map((task) => {
    const deps = depends.get(task.id) || [];
    const unique = [...new Set(deps.filter(Boolean))];
    if (!unique.length) {
      const { depends_on: _removed, ...rest } = task;
      return rest as PipelineTaskConfig;
    }
    return { ...task, depends_on: unique };
  });
}

export function PipelineVisualEditor({ pipelineId, config, onChange, className }: Props) {
  const { flowBackground, flowEdgeStroke, flowColorMode } = useChartTheme();
  const [selectedId, setSelectedId] = useState<string | null>(config.tasks[0]?.id ?? null);

  const preview = useMemo(() => configToPreviewPipeline(pipelineId, config), [pipelineId, config]);

  const { nodes, edges, canvasHeight } = useMemo(() => {
    const stages = preview.stages.filter((s) => s.id !== "_empty");
    const nodeIds = stages.map((s) => s.id);
    const dagEdges = stages.flatMap((stage) =>
      stage.dependencies.map((depId) => ({ source: depId, target: stage.id })),
    );
    const positions = layoutDagPositions(nodeIds, dagEdges);
    const initialNodes: Node<EditorNodeData>[] = stages.map((stage) => ({
      id: stage.id,
      type: "stage",
      position: positions[stage.id] ?? { x: 0, y: 0 },
      data: { stage },
      selected: stage.id === selectedId,
    }));
    const initialEdges: Edge[] = stages.flatMap((stage) =>
      stage.dependencies.map((depId) => ({
        id: `${depId}-${stage.id}`,
        source: depId,
        target: stage.id,
        style: { stroke: flowEdgeStroke, strokeWidth: 2 },
      })),
    );
    return {
      nodes: initialNodes,
      edges: initialEdges,
      canvasHeight: estimateDagCanvasHeight(nodeIds, dagEdges, { minHeight: 280 }),
    };
  }, [preview.stages, flowEdgeStroke, selectedId]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);

  useEffect(() => {
    setNodes(nodes);
    setEdges(edges);
  }, [nodes, edges, setNodes, setEdges]);

  const selectedTask = config.tasks.find((t) => t.id === selectedId) ?? null;

  const syncConfig = (tasks: PipelineTaskConfig[], edgeList: Edge[]) => {
    onChange({ ...config, tasks: applyDependsOn(tasks, edgesToDependsOn(edgeList)) });
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const nextEdges = [
      ...edgesState,
      {
        id: `${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
        style: { stroke: flowEdgeStroke, strokeWidth: 2 },
      },
    ];
    setEdges(nextEdges);
    syncConfig(config.tasks, nextEdges);
  };

  const onEdgesDelete = (deleted: Edge[]) => {
    const deletedIds = new Set(deleted.map((e) => e.id));
    const nextEdges = edgesState.filter((e) => !deletedIds.has(e.id));
    setEdges(nextEdges);
    syncConfig(config.tasks, nextEdges);
  };

  const updateSelectedTask = (patch: Partial<PipelineTaskConfig>) => {
    if (!selectedTask) return;
    const nextTasks = config.tasks.map((t) => (t.id === selectedTask.id ? { ...t, ...patch } : t));
    onChange({ ...config, tasks: nextTasks });
  };

  const addTask = () => {
    const base = `task_${config.tasks.length + 1}`;
    let id = base;
    let i = 1;
    while (config.tasks.some((t) => t.id === id)) {
      id = `${base}_${i++}`;
    }
    const nextTasks = [...config.tasks, { id, plugin: "echo_tracking" }];
    onChange({ ...config, tasks: nextTasks });
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selectedTask) return;
    const nextTasks = config.tasks.filter((t) => t.id !== selectedTask.id);
    const nextEdges = edgesState.filter((e) => e.source !== selectedTask.id && e.target !== selectedTask.id);
    setEdges(nextEdges);
    onChange({ ...config, tasks: applyDependsOn(nextTasks, edgesToDependsOn(nextEdges)) });
    setSelectedId(nextTasks[0]?.id ?? null);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={addTask}>
          <Plus className="h-4 w-4" />
          Add task
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={!selectedTask}
          onClick={removeSelected}
        >
          <Trash2 className="h-4 w-4" />
          Remove selected
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="overflow-hidden rounded-xl border border-border/70" style={{ height: canvasHeight }}>
          <ReactFlow
            nodes={nodesState}
            edges={edgesState}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            nodeTypes={nodeTypes}
            colorMode={flowColorMode}
            defaultMarkerColor={flowEdgeStroke}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color={flowBackground} gap={16} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <h4 className="text-sm font-medium text-foreground">Task inspector</h4>
          {!selectedTask ? (
            <p className="text-xs text-muted-foreground">Select a node to edit.</p>
          ) : (
            <>
              <label className="block text-xs text-muted-foreground">
                Task ID
                <input
                  value={selectedTask.id}
                  onChange={(e) => {
                    const nextId = e.target.value.trim();
                    if (!nextId) return;
                    const nextTasks = config.tasks.map((t) =>
                      t.id === selectedTask.id ? { ...t, id: nextId } : t,
                    );
                    const remap = new Map([[selectedTask.id, nextId]]);
                    const nextEdges = edgesState.map((edge) => ({
                      ...edge,
                      id: `${remap.get(edge.source) ?? edge.source}-${remap.get(edge.target) ?? edge.target}`,
                      source: remap.get(edge.source) ?? edge.source,
                      target: remap.get(edge.target) ?? edge.target,
                    }));
                    setEdges(nextEdges);
                    onChange({ ...config, tasks: applyDependsOn(nextTasks, edgesToDependsOn(nextEdges)) });
                    setSelectedId(nextId);
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Plugin
                <input
                  value={String(selectedTask.plugin || "")}
                  onChange={(e) => updateSelectedTask({ plugin: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs"
                />
              </label>
              <p className="text-[10px] text-muted-foreground">
                Type: {inferStageTypeFromLabel(String(selectedTask.plugin || selectedTask.id))}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Connect nodes left→right to set depends_on. Delete an edge with Backspace.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
