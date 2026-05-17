import type { TaskItem } from "./api";
import type { RunExecutionGraph } from "./execution-graph-types";
import { statusByTaskKey } from "./execution-task-keys";

/** Overlay live task statuses onto execution-graph nodes (config id vs ``runId:step`` task_id). */
export function mergeTaskStatusesIntoGraph(
  graph: RunExecutionGraph,
  tasks: Record<string, TaskItem> | TaskItem[],
  runId: string,
): RunExecutionGraph {
  const lookup = statusByTaskKey(tasks, runId);
  if (!lookup.size) return graph;

  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const status = lookup.get(n.id);
      return status ? { ...n, status } : n;
    }),
  };
}
