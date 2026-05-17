"use client";

import { create } from "zustand";

import type { ExecutionProjection, RunItem, TaskItem } from "./api";
import { reduceExecutionEnvelope, type ExecutionEnvelope } from "./execution-event-reducer";
import type { PipelineTopology, RunExecutionGraph } from "./execution-graph-types";

export type ExecutionStoreState = {
  scopeKey: string;
  runs: Record<string, RunItem>;
  tasksByRun: Record<string, Record<string, TaskItem>>;
  topologies: Record<string, PipelineTopology>;
  executionGraphs: Record<string, RunExecutionGraph>;

  setScope: (scopeKey: string) => void;
  hydrateRunSnapshot: (run: RunItem, tasks: TaskItem[]) => void;
  hydrateExecutionGraph: (graph: RunExecutionGraph) => void;
  hydrateTopology: (topology: PipelineTopology) => void;
  hydrateFromProjection: (projection: ExecutionProjection) => void;
  applyEnvelope: (ev: ExecutionEnvelope) => void;
  reset: () => void;
};

const emptyState = {
  scopeKey: "",
  runs: {} as Record<string, RunItem>,
  tasksByRun: {} as Record<string, Record<string, TaskItem>>,
  topologies: {} as Record<string, PipelineTopology>,
  executionGraphs: {} as Record<string, RunExecutionGraph>,
};

export const useExecutionStore = create<ExecutionStoreState>((set) => ({
  ...emptyState,

  setScope: (scopeKey) =>
    set((s) => {
      if (s.scopeKey === scopeKey) return s;
      return { ...emptyState, scopeKey };
    }),

  hydrateRunSnapshot: (run, tasks) =>
    set((s) => {
      const taskMap: Record<string, TaskItem> = {};
      for (const t of tasks) {
        taskMap[t.task_id] = t;
      }
      return {
        ...s,
        runs: { ...s.runs, [run.run_id]: run },
        tasksByRun: { ...s.tasksByRun, [run.run_id]: taskMap },
      };
    }),

  hydrateExecutionGraph: (graph) =>
    set((s) => ({
      ...s,
      executionGraphs: { ...s.executionGraphs, [graph.run_id]: graph },
      runs: s.runs[graph.run_id]
        ? s.runs
        : {
            ...s.runs,
            [graph.run_id]: {
              run_id: graph.run_id,
              tenant_id: "",
              project_id: "",
              pipeline_id: graph.pipeline_id,
              status: graph.run_status || "PENDING",
            },
          },
    })),

  hydrateTopology: (topology) =>
    set((s) => ({
      ...s,
      topologies: { ...s.topologies, [topology.pipeline_id]: topology },
    })),

  hydrateFromProjection: (projection) =>
    set((s) => {
      const runs = { ...s.runs };
      for (const [runId, row] of Object.entries(projection.runs ?? {})) {
        if (!row?.status) continue;
        const prev = runs[runId];
        runs[runId] = {
          ...(prev ?? {
            run_id: runId,
            tenant_id: "",
            project_id: "",
            pipeline_id: row.pipeline_id ?? "",
          }),
          run_id: runId,
          status: row.status,
          pipeline_id: row.pipeline_id ?? prev?.pipeline_id ?? "",
          updated_at: row.updated_at ?? prev?.updated_at,
        };
      }
      return { ...s, runs };
    }),

  applyEnvelope: (ev) =>
    set((s) => {
      const next = reduceExecutionEnvelope(
        {
          runs: s.runs,
          tasksByRun: s.tasksByRun,
          executionGraphs: s.executionGraphs,
        },
        ev,
      );
      return { ...s, ...next };
    }),

  reset: () => set({ ...emptyState }),
}));

export function scopeKeyFor(tenantId: string, projectId: string): string {
  return `${tenantId}::${projectId}`;
}
