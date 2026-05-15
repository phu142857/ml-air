import type { Pipeline, PipelineStage } from "@/lib/pipeline-types";

export type ApiPipelineDag = {
  pipeline_id: string;
  run_id?: string;
  nodes: Array<{ id: string; label: string; status: string }>;
  edges: Array<{ source: string; target: string }>;
};

function inferStageType(label: string): PipelineStage["type"] {
  const l = label.toLowerCase();
  if (l.includes("ingest") || l.includes("load") || l.includes("extract")) return "ingest";
  if (l.includes("train") || l.includes("fit")) return "train";
  if (l.includes("valid") || l.includes("eval") || l.includes("score")) return "validate";
  if (l.includes("deploy") || l.includes("publish")) return "deploy";
  return "transform";
}

function mapNodeStatus(raw: string): PipelineStage["status"] {
  const u = String(raw || "")
    .trim()
    .toUpperCase();
  if (u === "RUNNING" || u === "IN_PROGRESS") return "running";
  if (u === "SUCCESS" || u === "SUCCEEDED" || u === "OK" || u === "COMPLETED") return "success";
  if (u === "FAILED" || u === "ERROR") return "failed";
  if (u === "PENDING" || u === "QUEUED" || u === "WAITING") return "pending";
  return "idle";
}

/** Bridge API `/pipelines/.../dag` payload to the mock `Pipeline` shape consumed by `PipelineDAG`. */
export function apiDagToMockPipeline(pipelineId: string, dag: ApiPipelineDag): Pipeline {
  const stages: PipelineStage[] = (dag.nodes || []).map((n) => ({
    id: n.id,
    name: n.label?.trim() || n.id,
    type: inferStageType(n.label || n.id),
    status: mapNodeStatus(n.status),
    dependencies: (dag.edges || []).filter((e) => e.target === n.id).map((e) => e.source)
  }));

  if (!stages.length) {
    return {
      id: pipelineId,
      name: pipelineId,
      version: "—",
      status: "idle",
      stages: [
        {
          id: "_empty",
          name: "No DAG nodes",
          type: "transform",
          status: "idle",
          dependencies: []
        }
      ]
    };
  }

  return {
    id: pipelineId,
    name: pipelineId,
    version: dag.run_id ? `run ${dag.run_id.slice(0, 8)}…` : "latest",
    status: "idle",
    stages
  };
}
