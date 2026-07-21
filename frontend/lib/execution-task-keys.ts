import type { TaskItem } from "./api";

/** Scheduler/API task_id is often ``{runId}:{configTaskKey}``; DAG nodes use ``configTaskKey``. */
export function taskNodeId(taskId: string, runId: string): string {
  const prefix = `${runId}:`;
  const tid = String(taskId || "").trim();
  if (tid.startsWith(prefix)) return tid.slice(prefix.length);
  return tid;
}

export function taskMatchesNode(nodeId: string, taskId: string, runId: string): boolean {
  const node = String(nodeId || "").trim();
  const tid = String(taskId || "").trim();
  if (!node || !tid) return false;
  if (node === tid) return true;
  return tid === `${runId}:${node}`;
}

export function statusByTaskKey(
  tasks: Record<string, TaskItem> | TaskItem[],
  runId: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const list = Array.isArray(tasks) ? tasks : Object.values(tasks);
  for (const t of list) {
    const status = String(t.status || "").trim();
    if (!status) continue;
    const tid = String(t.task_id || "").trim();
    map.set(tid, status);
    map.set(taskNodeId(tid, runId), status);
  }
  return map;
}
