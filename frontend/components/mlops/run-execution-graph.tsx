"use client";

import { Loader2 } from "lucide-react";

import { PipelineDAG } from "@/components/mlops/pipeline-dag";
import { useRunExecutionGraph } from "@/hooks/use-run-execution-graph";

type Props = {
  tenantId: string;
  projectId: string;
  runId: string;
  token: string;
  enabled: boolean;
  className?: string;
};

export function RunExecutionGraph({ tenantId, projectId, runId, token, enabled, className }: Props) {
  const { pipeline, graphQuery, isLoading } = useRunExecutionGraph(
    tenantId,
    projectId,
    runId,
    token,
    enabled,
  );

  if (!enabled) {
    return (
      <p className="text-sm text-muted-foreground">Pin tenant and project to load the execution graph.</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading execution graph…
      </div>
    );
  }

  if (graphQuery.isError) {
    return (
      <p className="text-sm text-destructive">Could not load execution graph: {String(graphQuery.error)}</p>
    );
  }

  if (!pipeline) {
    return <p className="text-sm text-muted-foreground">No execution graph for this run.</p>;
  }

  return (
    <div className={className}>
      <PipelineDAG key={`${runId}-${pipeline.stages.map((s) => s.status).join("-")}`} pipeline={pipeline} />
    </div>
  );
}
