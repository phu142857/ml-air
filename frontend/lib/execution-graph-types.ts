/** API shapes for static topology vs per-run execution graph (Phase 2). */

export type ExecutionGraphNode = {
  id: string;
  label: string;
  status?: string;
};

export type ExecutionGraphEdge = {
  source: string;
  target: string;
};

export type PipelineTopology = {
  pipeline_id: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  from_config?: boolean;
  pipeline_version_id?: string | null;
  version?: number | null;
};

export type RunExecutionGraph = {
  pipeline_id: string;
  run_id: string;
  run_status?: string;
  pipeline_version_id?: string | null;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
};
