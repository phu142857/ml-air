import type { RunItem } from "@/lib/api";
import { isActiveExecutionStatus } from "@/lib/status-style";
import { parseTsMs } from "@/lib/time-parse";

export type RunWallClockTask = {
  status?: string | null;
  finished_at?: string | null;
};

function taskEndMs(task: RunWallClockTask): number | null {
  const finished = parseTsMs(task.finished_at ?? undefined);
  if (finished != null) return finished;
  return null;
}

/**
 * Run wall-clock duration: created_at → max(task.finished_at), live now when run is active.
 * Without tasks, terminal runs fall back to updated_at; active runs use nowMs.
 */
export function computeRunWallDurationSeconds(
  run: Pick<RunItem, "created_at" | "updated_at" | "status">,
  tasks: RunWallClockTask[] | undefined,
  nowMs: number = Date.now(),
): number | null {
  const startMs = parseTsMs(run.created_at);
  if (startMs == null) return null;

  if (isActiveExecutionStatus(run.status)) {
    return Math.max(0, (nowMs - startMs) / 1000);
  }

  const taskEnds = (tasks ?? [])
    .map(taskEndMs)
    .filter((ms): ms is number => ms != null);
  if (taskEnds.length > 0) {
    const endMs = Math.max(...taskEnds);
    return Math.max(0, (endMs - startMs) / 1000);
  }

  const updatedMs = parseTsMs(run.updated_at);
  if (updatedMs == null || updatedMs < startMs) return null;
  return Math.max(0, (updatedMs - startMs) / 1000);
}
