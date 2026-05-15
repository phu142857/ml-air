/** Display shape for pipeline DAG visualization (not API list items). */

export type PipelineStageStatus = "idle" | "running" | "success" | "failed" | "pending"
export type PipelineStageType = "ingest" | "transform" | "train" | "validate" | "deploy"
export type PipelineDisplayStatus = "idle" | "running" | "failed" | "success"

export interface PipelineStage {
  id: string
  name: string
  type: PipelineStageType
  status: PipelineStageStatus
  dependencies: string[]
}

export interface Pipeline {
  id: string
  name: string
  version: string
  status: PipelineDisplayStatus
  stages: PipelineStage[]
  lastRunAt?: string
  schedule?: string
}
