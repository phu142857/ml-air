"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";

export default function TasksPage() {
  const router = useRouter();
  const [taskId, setTaskId] = useState("");

  return (
    <RouteShell activeNav="Tasks" title="Tasks" subtitle="Task-level logs, metrics and artifacts">
      <section className="rounded-2xl border border-slate-700 bg-bg-card p-5 shadow-lg shadow-black/30">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Task Detail</h2>
        <div className="flex items-center gap-2">
          <input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="Enter task_id"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
            onClick={() => {
              if (!taskId.trim()) return;
              router.push(`/tasks/${taskId.trim()}`);
            }}
          >
            Open Task
          </button>
        </div>
      </section>
    </RouteShell>
  );
}
