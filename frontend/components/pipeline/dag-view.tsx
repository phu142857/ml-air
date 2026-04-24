"use client";

import ReactFlow, { Background, Controls, Edge, Node } from "reactflow";
import "reactflow/dist/style.css";
import { TaskItem } from "@/lib/api";

type Props = {
  tasks: TaskItem[];
  onClickTask?: (taskId: string) => void;
};

export function DagView({ tasks, onClickTask }: Props) {
  const sourceTasks = tasks.length
    ? tasks
    : [
        { task_id: "prepare", status: "SUCCESS", attempt: 1 },
        { task_id: "train", status: "RUNNING", attempt: 1 },
        { task_id: "evaluate", status: "PENDING", attempt: 0 }
      ];

  const nodes: Node[] = sourceTasks.map((task, index) => {
    const status = String(task.status).toUpperCase();
    const style =
      status === "SUCCESS"
        ? { background: "#052e16", border: "1px solid #22C55E", color: "#bbf7d0" }
        : status === "FAILED"
          ? { background: "#450a0a", border: "1px solid #EF4444", color: "#fecaca" }
          : status === "RUNNING"
            ? { background: "#78350f", border: "1px solid #F59E0B", color: "#fde68a" }
            : { background: "#1f2937", border: "1px solid #64748b", color: "#cbd5e1" };
    return {
      id: task.task_id,
      data: { label: `${task.task_id} (${status})` },
      position: { x: index * 240 + 10, y: index % 2 === 0 ? 70 : 190 },
      style
    };
  });

  const edges: Edge[] = sourceTasks
    .slice(1)
    .map((task, index) => ({ id: `e-${index}`, source: sourceTasks[index].task_id, target: task.task_id }));

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onNodeClick={(_, node) => {
          if (onClickTask) onClickTask(node.id);
        }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
