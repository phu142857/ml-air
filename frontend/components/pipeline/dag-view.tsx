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
    const vars =
      status === "SUCCESS"
        ? { bg: "var(--status-success-bg)", fg: "var(--status-success-fg)", border: "var(--status-success-border)" }
        : status === "FAILED"
          ? { bg: "var(--status-failed-bg)", fg: "var(--status-failed-fg)", border: "var(--status-failed-border)" }
          : status === "RUNNING"
            ? { bg: "var(--status-running-bg)", fg: "var(--status-running-fg)", border: "var(--status-running-border)" }
            : { bg: "var(--status-pending-bg)", fg: "var(--status-pending-fg)", border: "var(--status-pending-border)" };
    return {
      id: task.task_id,
      data: { label: `${task.task_id} (${status})` },
      position: { x: index * 240 + 10, y: index % 2 === 0 ? 70 : 190 },
      style: {
        background: vars.bg,
        border: `1px solid ${vars.border}`,
        color: vars.fg,
        borderRadius: 12,
        fontSize: 12,
        padding: "6px 10px"
      }
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
      <div className="h-[420px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
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
