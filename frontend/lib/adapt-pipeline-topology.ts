import type { PipelineTopology, RunExecutionGraph } from "./execution-graph-types";
import { normalizePipelineForDag } from "./adapt-pipeline-dag";
import { executionGraphToPipeline, topologyToPipeline } from "./project-execution-graph";
import type { Pipeline } from "./pipeline-types";

export function pipelineFromTopologyQuery(
  pipelineId: string,
  data: PipelineTopology | undefined | null,
): Pipeline | null {
  if (!data || data.pipeline_id !== pipelineId) return null;
  return normalizePipelineForDag(topologyToPipeline(data));
}

export function pipelineFromExecutionGraphQuery(
  runId: string,
  data: RunExecutionGraph | undefined | null,
): Pipeline | null {
  if (!data || data.run_id !== runId) return null;
  return normalizePipelineForDag(executionGraphToPipeline(data));
}
