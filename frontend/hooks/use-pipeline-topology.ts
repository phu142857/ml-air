"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchPipelineTopology } from "@/lib/api";
import { pipelineFromTopologyQuery } from "@/lib/adapt-pipeline-topology";
import { useExecutionStore } from "@/lib/execution-store";
import { mlairKeys } from "@/lib/query-keys";
import { realtimeFallbackPolling } from "@/lib/realtime-fallback-polling";
import type { Pipeline } from "@/lib/pipeline-types";

/** Static pipeline topology (no latest-run overlay) with optional store projection. */
export function usePipelineTopology(
  tenantId: string,
  projectId: string,
  pipelineId: string,
  token: string,
  enabled: boolean,
) {
  const topologyQuery = useQuery({
    queryKey: mlairKeys.pipelines.topology(tenantId, projectId, pipelineId),
    queryFn: () => fetchPipelineTopology(tenantId, projectId, pipelineId, token),
    enabled: enabled && Boolean(token?.trim()) && Boolean(pipelineId),
    ...realtimeFallbackPolling(),
  });

  const storeTopology = useExecutionStore((s) => s.topologies[pipelineId]);
  const hydrateTopology = useExecutionStore((s) => s.hydrateTopology);

  useEffect(() => {
    if (topologyQuery.data) {
      hydrateTopology(topologyQuery.data);
    }
  }, [topologyQuery.data, hydrateTopology]);

  const topology = storeTopology ?? topologyQuery.data;

  const pipeline: Pipeline | null = useMemo(
    () => (topology ? pipelineFromTopologyQuery(pipelineId, topology) : null),
    [topology, pipelineId],
  );

  return {
    topologyQuery,
    topology,
    pipeline,
    isLoading: topologyQuery.isLoading && !topology,
  };
}
