"use client";

import { useMemo } from "react";
import { PipelineDAG } from "@/components/mlops/pipeline-dag";
import { apiDagToMockPipeline, type ApiPipelineDag } from "@/lib/adapt-pipeline-dag";

type Props = {
  pipelineId: string;
  dag: ApiPipelineDag;
  onClickTask?: (taskId: string) => void;
};

/** Thin wrapper — same DAG renderer as the pipelines list page. */
export function DagView({ pipelineId, dag }: Props) {
  const pipeline = useMemo(() => apiDagToMockPipeline(pipelineId, dag), [pipelineId, dag]);
  return <PipelineDAG pipeline={pipeline} />;
}
