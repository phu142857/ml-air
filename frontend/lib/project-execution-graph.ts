import { apiDagToMockPipeline, mapNodeStatus, type ApiPipelineDag } from "./adapt-pipeline-dag";
import type { Pipeline } from "./pipeline-types";
import type { RunExecutionGraph, PipelineTopology } from "./execution-graph-types";

/** Static topology → Pipeline with all stages idle (observability pages). */
export function topologyToPipeline(topology: PipelineTopology): Pipeline {
  const dag: ApiPipelineDag = {
    pipeline_id: topology.pipeline_id,
    nodes: (topology.nodes || []).map((n) => ({
      id: n.id,
      label: n.label,
      status: "idle",
    })),
    edges: topology.edges || [],
  };
  const version =
    topology.version != null ? `v${topology.version}` : topology.pipeline_version_id?.slice(0, 8) ?? "config";
  const p = apiDagToMockPipeline(topology.pipeline_id, dag);
  return { ...p, version, status: "idle" };
}

/** Per-run execution graph → Pipeline with live task statuses. */
export function executionGraphToPipeline(graph: RunExecutionGraph): Pipeline {
  const dag: ApiPipelineDag = {
    pipeline_id: graph.pipeline_id,
    run_id: graph.run_id,
    nodes: (graph.nodes || []).map((n) => ({
      id: n.id,
      label: n.label,
      status: n.status || "PENDING",
    })),
    edges: graph.edges || [],
  };
  const p = apiDagToMockPipeline(graph.pipeline_id, dag);
  const runSt = mapNodeStatus(graph.run_status || "PENDING");
  const displayStatus =
    runSt === "running" ? "running" : runSt === "failed" ? "failed" : runSt === "success" ? "success" : "idle";
  return { ...p, version: `run ${graph.run_id.slice(0, 10)}…`, status: displayStatus };
}
