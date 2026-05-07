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
        ? { background: "rgba(62,207,142,0.12)", border: "1px solid rgba(62,207,142,0.45)", color: "#3ecf8e" }
        : status === "FAILED"
          ? { background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.5)", color: "#fca5a5" }
          : status === "RUNNING"
            ? { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.45)", color: "#93c5fd" }
            : { background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.45)", color: "#fcd34d" };
    return {
      id: task.task_id,
      data: { label: `${task.task_id} (${status})` },
      position: { x: index * 240 + 10, y: index % 2 === 0 ? 70 : 190 },
      style: { ...style, borderRadius: 12, fontSize: 12, padding: "6px 10px" }
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
      <div className="h-[420px] w-full overflow-hidden rounded-xl border border-border bg-muted">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodeClick={(_, node) => {
            if (onClickTask) onClickTask(node.id);
          }}
        >
          <Background color="var(--border-default)" gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
