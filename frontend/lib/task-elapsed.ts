import type { TaskItem } from "@/lib/api";
import { parseTsMs } from "@/lib/time-parse";

const TERMINAL_STATUSES = new Set([
  "SUCCESS",
  "SUCCEEDED",
  "FAILED",
  "FAILURE",
  "CANCELLED",
  "CANCELED",
]);

/**
 * Task elapsed wall time: started_at → finished_at (or now when RUNNING), fallback duration_ms.
 */
export function computeTaskElapsedSeconds(
  task: Pick<TaskItem, "status" | "started_at" | "finished_at" | "duration_ms">,
  nowMs: number = Date.now(),
): number | null {
  const status = String(task.status || "").toUpperCase();
  const startedMs = parseTsMs(task.started_at ?? undefined);

  if (status === "RUNNING") {
    if (startedMs == null) return null;
    return Math.max(0, (nowMs - startedMs) / 1000);
  }

  if (!TERMINAL_STATUSES.has(status)) return null;

  if (startedMs != null) {
    const finishedMs = parseTsMs(task.finished_at ?? undefined);
    if (finishedMs != null) {
      return Math.max(0, (finishedMs - startedMs) / 1000);
    }
  }

  if (task.duration_ms != null && task.duration_ms > 0) {
    return task.duration_ms / 1000;
  }

  return null;
}

export function hasRunningTask(
  tasks: Pick<TaskItem, "status">[],
): boolean {
  return tasks.some((task) => String(task.status || "").toUpperCase() === "RUNNING");
}
