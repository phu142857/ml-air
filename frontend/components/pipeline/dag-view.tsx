"use client";

import ReactFlow, { Background, Controls, Edge, Node } from "reactflow";
import "reactflow/dist/style.css";
import { TaskItem } from "@/lib/api";
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style";

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
    const status = normalizeStatus(task.status);
    const style =
      status === "SUCCESS"
        ? { background: "#DCFCE7", border: "1px solid #16A34A", color: "#166534" }
        : status === "FAILED"
          ? { background: "#FEE2E2", border: "2px solid #DC2626", color: "#7F1D1D", boxShadow: "0 0 0 1px rgba(220,38,38,0.18)" }
          : status === "RUNNING"
            ? { background: "#DBEAFE", border: "1px solid #2563EB", color: "#1E3A8A" }
            : { background: "#FEF3C7", border: "1px solid #D97706", color: "#78350F" };
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {(["SUCCESS", "FAILED", "RUNNING", "PENDING"] as const).map((label) => (
          <span key={label} className={`rounded-full border px-2 py-1 font-semibold ${statusBadgeClass(label)}`}>
            {label}
          </span>
        ))}
      </div>
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
    </div>
  );
}
