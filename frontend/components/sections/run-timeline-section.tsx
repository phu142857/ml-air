"use client";

import { useEffect, useRef } from "react";
import type { TaskItem } from "@/lib/api";

type Props = { tasks: TaskItem[]; runId: string; onOpenTask: (taskId: string) => void };

function parseTs(s: string | null | undefined): number {
  if (!s) return Date.now();
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.now() : t;
}

export function RunTimelineSection({ tasks, onOpenTask }: Props) {
  const failRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (failRef.current) {
      failRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [tasks]);

  // Helper function outside map to avoid re-creation
  const getStatus = (task: any): "success" | "error" | "running" | "pending" => {
    if (task.error_message && task.error_message.length > 0) return "error";
    if (task.status === "FAILED") return "error";
    if (task.status === "SUCCESS") return "success";
    if (task.status === "RUNNING") return "running";
    return "pending";
  };

  if (!tasks.length) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
        No tasks yet
      </div>
    );
  }

  const t0 = Math.min(...tasks.map((t) => parseTs(t.started_at || t.created_at)));
  const t1 = Math.max(...tasks.map((t) => parseTs(t.finished_at || t.updated_at || t.started_at || t.created_at)));
  const span = Math.max(1, t1 - t0);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-3 text-sm font-medium text-slate-200">Task timeline</div>
      <div className="space-y-3">
        {tasks.map((t, i) => {
          const a = parseTs(t.started_at || t.created_at);
          const b = parseTs(t.finished_at || t.updated_at || t.started_at);
          const left = ((a - t0) / span) * 100;
          const width = Math.max(2, Math.max(0, ((b - a) / span) * 100));
          const taskStatus = getStatus(t);
          const isFail = taskStatus === "error";
          const isLastFailed =
            isFail &&
            !tasks
              .slice(i + 1)
              .some((u) => getStatus(u) === "error");
          return (
            <div
              key={t.task_id + t.attempt}
              ref={isLastFailed ? failRef : undefined}
              className={`rounded-lg border p-2 ${
                taskStatus === "success" ? "task-card task-success" :
                taskStatus === "error" ? "task-card task-error" :
                taskStatus === "running" ? "task-card task-running" :
                "task-card task-pending"
              }`}
            >
              <div className="mb-1 flex items-center justify-between text-xs text-secondary">
                <button
                  type="button"
                  onClick={() => onOpenTask(t.task_id)}
                  className="font-mono text-left text-primary hover:underline"
                >
                  {t.task_id} · attempt {t.attempt} · {taskStatus.toUpperCase()}
                </button>
                {t.error_message && <span className="text-error font-medium">error</span>}
              </div>
              <div className="progress-bar">
                <div
                  className={`absolute top-0 h-3 ${
                    taskStatus === "success" ? "progress-fill-success" :
                    taskStatus === "error" ? "progress-fill-error" :
                    "progress-fill-info"
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-disabled">
                <span>wall: {t.duration_ms != null ? `${t.duration_ms}ms` : "-"}</span>
                <span>cpu: {t.cpu_time_seconds != null ? `${t.cpu_time_seconds.toFixed(4)}s` : "-"}</span>
                <span>rss: {t.memory_rss_kb != null ? `${t.memory_rss_kb}KB` : "-"}</span>
              </div>
              {t.error_message && <p className="mt-1 break-all text-xs text-error">{t.error_message}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
