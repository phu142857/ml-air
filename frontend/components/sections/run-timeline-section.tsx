"use client";

import { useEffect, useRef, useMemo } from "react";
import type { TaskItem, RunTracking } from "@/lib/api";

type Props = {
  tasks: TaskItem[];
  runId: string;
  tracking?: RunTracking | null;
  onOpenTask: (taskId: string) => void;
};

function parseTs(s: string | null | undefined): number {
  if (!s) return Date.now();
  const t = Date.parse(s);
  return Number.isNaN(t) ? Date.now() : t;
}

/**
 * Extract the task key from a full task_id.
 * Format: "{run_id}:{task_key}" — e.g. "abc-123:data_prep" → "data_prep"
 */
function taskKey(taskId: string): string {
  const idx = taskId.lastIndexOf(":");
  return idx >= 0 ? taskId.slice(idx + 1) : taskId;
}

function getStatus(task: TaskItem): "success" | "error" | "running" | "queued" | "pending" {
  if (task.error_message && task.error_message.length > 0) return "error";
  if (task.status === "FAILED") return "error";
  if (task.status === "SUCCESS") return "success";
  if (task.status === "QUEUED") return "queued";
  if (task.status === "RUNNING") return "running";
  return "pending";
}

export function RunTimelineSection({ tasks, tracking, onOpenTask }: Props) {
  const failRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (failRef.current) {
      failRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [tasks]);

  // Build a per-task progress map: taskKey → percentage (0–100).
  // Metrics are stored as "{taskKey}_progress_pct" at the run level.
  const taskProgressMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!tracking?.metrics) return map;
    const suffix = "_progress_pct";
    const stepMap: Record<string, number> = {};
    for (const m of tracking.metrics) {
      if (!m.key.endsWith(suffix)) continue;
      const key = m.key.slice(0, -suffix.length);
      const prevStep = stepMap[key] ?? -1;
      if (m.step > prevStep) {
        stepMap[key] = m.step;
        map[key] = Math.min(100, Math.max(0, Math.round(m.value)));
      }
    }
    return map;
  }, [tracking]);

  if (!tasks.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
        No tasks yet
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="space-y-3">
        {tasks.map((t, i) => {
          const taskStatus = getStatus(t);
          const isFail = taskStatus === "error";
          const isLastFailed =
            isFail && !tasks.slice(i + 1).some((u) => getStatus(u) === "error");

          // Determine this task's progress independently
          let pct: number;
          if (taskStatus === "success") {
            pct = 100;
          } else if (taskStatus === "error") {
            pct = taskProgressMap[taskKey(t.task_id)] ?? 0;
          } else if (taskStatus === "running") {
            pct = taskProgressMap[taskKey(t.task_id)] ?? 0;
          } else {
            pct = 0; // pending / queued
          }

          return (
            <div
              key={t.task_id + t.attempt}
              ref={isLastFailed ? failRef : undefined}
              className={`rounded-xl border p-3 transition ${
                taskStatus === "error"
                  ? "border-red-500/40 bg-red-500/10"
                  : taskStatus === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : taskStatus === "running"
                      ? "border-sky-500/40 bg-sky-500/10"
                      : taskStatus === "queued"
                        ? "border-[var(--status-pending-border)] bg-[var(--status-pending-bg)]"
                        : "border-zinc-800 bg-zinc-950/60"
              }`}
            >
              {/* Task Header */}
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  onClick={() => onOpenTask(t.task_id)}
                  className="font-mono text-xs text-zinc-200 hover:text-sky-300 hover:underline"
                >
                  {t.task_id} · attempt {t.attempt}
                </button>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    taskStatus === "error" && "bg-red-500/20 text-red-300"
                  }${taskStatus === "success" && " bg-emerald-500/20 text-emerald-300"}${
                    taskStatus === "running" && " bg-sky-500/20 text-sky-300"
                  }${taskStatus === "queued" && " bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]"}${
                    taskStatus === "pending" && " bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {taskStatus}
                </span>
              </div>

              {/* Per-task Progress Bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 flex-1 rounded-full overflow-hidden bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      taskStatus === "error"
                        ? "bg-red-400"
                        : pct >= 100
                          ? "bg-emerald-400"
                          : pct > 0
                            ? "bg-sky-400"
                            : "bg-transparent"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span
                  className={`font-mono text-xs font-bold shrink-0 w-8 text-right ${
                    pct >= 100 ? "text-emerald-400" : pct > 0 ? "text-sky-400" : "text-zinc-500"
                  }`}
                >
                  {pct}%
                </span>
              </div>

              {/* Meta Info */}
              <div className="flex gap-4 text-xs text-zinc-500">
                <span>wall: {t.duration_ms ?? "-"}ms</span>
                <span>cpu: {t.cpu_time_seconds?.toFixed(4) ?? "-"}s</span>
                <span>rss: {t.memory_rss_kb ?? "-"}KB</span>
              </div>

              {/* Error Message */}
              {t.error_message && (
                <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-300">
                  {t.error_message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
