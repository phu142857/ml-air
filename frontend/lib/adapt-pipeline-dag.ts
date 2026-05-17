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

/** True when cached/query DAG payload belongs to the requested pipeline (avoids stale cross-pipeline preview). */
export function dagDataMatchesPipeline(
  data: ApiPipelineDag | Pipeline | undefined | null,
  pipelineId: string,
): boolean {
  if (!data || !pipelineId) return false;
  const want = String(pipelineId).trim();
  if ("pipeline_id" in data && data.pipeline_id) {
    return String(data.pipeline_id).trim() === want;
  }
  if ("id" in data && data.id) {
    return String(data.id).trim() === want;
  }
  return false;
}

const EMPTY_STAGE: PipelineStage = {
  id: "_empty",
  name: "No DAG nodes",
  type: "transform",
  status: "idle",
  dependencies: [],
};

/** Ensure `PipelineDAG` always receives a valid `stages` array (guards stale React Query cache). */
export function normalizePipelineForDag(pipeline: Pipeline | null | undefined): Pipeline | null {
  if (!pipeline) return null;
  const raw = Array.isArray(pipeline.stages) ? pipeline.stages : [];
  const stages: PipelineStage[] = raw.map((s) => ({
    ...s,
    id: String(s.id || "").trim() || "_stage",
    name: String(s.name || s.id || "stage").trim() || "stage",
    dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
  }));
  return {
    ...pipeline,
    id: String(pipeline.id || "").trim() || "pipeline",
    name: String(pipeline.name || pipeline.id || "pipeline").trim() || "pipeline",
    stages: stages.length ? stages : [{ ...EMPTY_STAGE }],
  };
}

/** React Query cache for `mlairKeys.pipelines.dag` should store `ApiPipelineDag` (raw API). */
export function pipelineFromDagQueryData(
  pipelineId: string,
  data: ApiPipelineDag | Pipeline | undefined | null,
): Pipeline | null {
  if (!data || !dagDataMatchesPipeline(data, pipelineId)) return null;
  const hasNodes = "nodes" in data && Array.isArray((data as ApiPipelineDag).nodes);
  const hasStages = "stages" in data && Array.isArray((data as Pipeline).stages);
  if (hasNodes) {
    return normalizePipelineForDag(apiDagToMockPipeline(pipelineId, data as ApiPipelineDag));
  }
  if (hasStages) {
    return normalizePipelineForDag(data as Pipeline);
  }
  return normalizePipelineForDag(apiDagToMockPipeline(pipelineId, data as ApiPipelineDag));
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
