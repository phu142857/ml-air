import type { RunItem, TaskItem } from "./api";
import type { RunExecutionGraph } from "./execution-graph-types";
import { taskMatchesNode, taskNodeId } from "./execution-task-keys";

export type ExecutionEnvelope = {
  type?: string;
  resource_id?: string | null;
  payload?: {
    updated_at?: number;
    run_id?: string;
    pipeline_id?: string;
    status?: string;
  };
};

function isoFromUnix(ts: number): string {
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function updatedAtMs(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

export type ExecutionStoreSlice = {
  runs: Record<string, RunItem>;
  tasksByRun: Record<string, Record<string, TaskItem>>;
  executionGraphs: Record<string, RunExecutionGraph>;
};

export function reduceExecutionEnvelope(
  state: ExecutionStoreSlice,
  ev: ExecutionEnvelope,
): ExecutionStoreSlice {
  const p = ev.payload;
  if (!p || typeof p.status !== "string") return state;

  const updatedAt =
    typeof p.updated_at === "number" ? p.updated_at : Math.floor(Date.now() / 1000);
  const uaMs = updatedAt * 1000;
  const typ = ev.type;
  const rid = typeof ev.resource_id === "string" ? ev.resource_id : undefined;
  const runFromPayload = typeof p.run_id === "string" ? p.run_id : undefined;

  let { runs, tasksByRun, executionGraphs } = state;

  if ((typ === "run.updated" || typ === "run.created") && rid && typeof p.status === "string") {
    const status = p.status;
    const iso = isoFromUnix(updatedAt);
    const prevRun = runs[rid];
    if (prevRun && updatedAtMs(prevRun.updated_at) > uaMs) {
      return state;
    }
    runs = {
      ...runs,
      [rid]: {
        ...(prevRun ?? ({} as RunItem)),
        run_id: rid,
        status,
        updated_at: iso,
        pipeline_id: String(p.pipeline_id || prevRun?.pipeline_id || "").trim() || prevRun?.pipeline_id,
        tenant_id: prevRun?.tenant_id,
        project_id: prevRun?.project_id,
      },
    };

    const graph = executionGraphs[rid];
    if (graph) {
      executionGraphs = {
        ...executionGraphs,
        [rid]: { ...graph, run_status: status },
      };
    }
  }

  if (
    (typ === "training.completed" || typ === "training.triggered") &&
    rid &&
    typeof p.status === "string"
  ) {
    const status = p.status;
    const iso = isoFromUnix(updatedAt);
    const prevRun = runs[rid];
    if (prevRun && updatedAtMs(prevRun.updated_at) > uaMs) {
      return state;
    }
    runs = {
      ...runs,
      [rid]: {
        ...(prevRun ?? ({} as RunItem)),
        run_id: rid,
        status,
        updated_at: iso,
        pipeline_id: String(p.pipeline_id || prevRun?.pipeline_id || "").trim() || prevRun?.pipeline_id,
        tenant_id: prevRun?.tenant_id,
        project_id: prevRun?.project_id,
      },
    };

    const graph = executionGraphs[rid];
    if (graph) {
      executionGraphs = {
        ...executionGraphs,
        [rid]: { ...graph, run_status: status },
      };
    }
  }

  if (typ === "task.updated" && runFromPayload && rid && typeof p.status === "string") {
    const status = p.status;
    const iso = isoFromUnix(updatedAt);
    const runId = runFromPayload;
    const prevTasks = tasksByRun[runId] ?? {};
    const prevTask = prevTasks[rid];
    if (prevTask && updatedAtMs(prevTask.updated_at) > uaMs) {
      return state;
    }
    tasksByRun = {
      ...tasksByRun,
      [runId]: {
        ...prevTasks,
        [rid]: {
          ...(prevTask ?? { task_id: rid, attempt: 0 }),
          task_id: rid,
          status,
          updated_at: iso,
        },
      },
    };

    const graph = executionGraphs[runId];
    const mergedTasks = tasksByRun[runId] ?? {};
    if (graph) {
      executionGraphs = {
        ...executionGraphs,
        [runId]: {
          ...graph,
          nodes: graph.nodes.map((n) =>
            taskMatchesNode(n.id, rid, runId) ? { ...n, status } : n,
          ),
        },
      };
    } else {
      const pipelineId = runs[runId]?.pipeline_id ?? "";
      executionGraphs = {
        ...executionGraphs,
        [runId]: {
          pipeline_id: pipelineId,
          run_id: runId,
          run_status: runs[runId]?.status,
          nodes: Object.values(mergedTasks).map((t) => ({
            id: taskNodeId(t.task_id, runId),
            label: taskNodeId(t.task_id, runId),
            status: t.status,
          })),
          edges: [],
        },
      };
    }
  }

  if (runs === state.runs && tasksByRun === state.tasksByRun && executionGraphs === state.executionGraphs) {
    return state;
  }
  return { runs, tasksByRun, executionGraphs };
}
