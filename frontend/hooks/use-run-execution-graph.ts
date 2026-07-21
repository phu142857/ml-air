"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchRunExecutionGraph } from "@/lib/api";
import { pipelineFromExecutionGraphQuery } from "@/lib/adapt-pipeline-topology";
import { useExecutionStore } from "@/lib/execution-store";
import { mergeTaskStatusesIntoGraph } from "@/lib/merge-execution-graph-tasks";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import type { Pipeline } from "@/lib/pipeline-types";

/**
 * Snapshot (React Query) + live projection (execution store) for a single run's DAG.
 */
export function useRunExecutionGraph(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
  enabled: boolean,
) {
  const poll = useRealtimeQueryPolling();
  const graphQuery = useQuery({
    queryKey: mlairKeys.run.executionGraph(tenantId, projectId, runId),
    queryFn: () => fetchRunExecutionGraph(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(token?.trim()) && Boolean(runId),
    refetchOnMount: "always",
    ...poll,
  });

  const storeGraph = useExecutionStore((s) => s.executionGraphs[runId]);
  const storeTasks = useExecutionStore((s) => s.tasksByRun[runId]);
  const storeRun = useExecutionStore((s) => s.runs[runId]);
  const hydrateExecutionGraph = useExecutionStore((s) => s.hydrateExecutionGraph);

  useEffect(() => {
    if (graphQuery.data) {
      hydrateExecutionGraph(graphQuery.data);
    }
  }, [graphQuery.data, hydrateExecutionGraph]);

  const graph = useMemo(() => {
    const base = storeGraph ?? graphQuery.data;
    if (!base) return null;
    const merged = storeTasks
      ? mergeTaskStatusesIntoGraph(base, storeTasks, runId)
      : base;
    if (storeRun?.status && merged.run_status !== storeRun.status) {
      return { ...merged, run_status: storeRun.status };
    }
    return merged;
  }, [storeGraph, graphQuery.data, storeTasks, storeRun?.status, runId]);

  const pipeline: Pipeline | null = useMemo(
    () => (graph ? pipelineFromExecutionGraphQuery(runId, graph) : null),
    [graph, runId],
  );

  return {
    graphQuery,
    graph,
    pipeline,
    isLoading: graphQuery.isLoading && !graph,
  };
}
