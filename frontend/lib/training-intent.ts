/**
 * Intent-driven training façade: prefer /runs/trigger (model + dataset); keep pipeline run for compat / advanced DAG execution.
 */
import { triggerPipelineRunWithGating, triggerRunFromModelDataset } from "./api";

export type TrainingIntentFromModelDataset = {
  kind: "model_dataset";
  modelId: string;
  datasetId: string;
  datasetVersionId?: string;
  pipelineIdOverride?: string;
  trainingMode: string;
  idempotencyKey?: string | null;
  priority?: string;
  maxParallelTasks?: number;
  overrideConfig?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type TrainingIntentPipelineCompat = {
  kind: "pipeline_compat";
  pipelineId: string;
  trainingMode: string;
  overrideConfig?: Record<string, unknown>;
  idempotencyKey?: string | null;
  priority?: string;
  maxParallelTasks?: number;
  pipelineVersionId?: string;
  useLatestPipelineVersion?: boolean;
  context?: Record<string, unknown>;
};

export type TrainingIntent = TrainingIntentFromModelDataset | TrainingIntentPipelineCompat;

export async function executeTrainingIntent(
  tenantId: string,
  projectId: string,
  token: string,
  intent: TrainingIntent
) {
  if (intent.kind === "model_dataset") {
    return triggerRunFromModelDataset(tenantId, projectId, token, {
      model_id: intent.modelId,
      dataset_id: intent.datasetId,
      dataset_version_id: intent.datasetVersionId,
      pipeline_id_override: intent.pipelineIdOverride,
      idempotency_key: intent.idempotencyKey,
      priority: intent.priority ?? "normal",
      max_parallel_tasks: intent.maxParallelTasks ?? 1,
      training_mode: intent.trainingMode,
      override_config: intent.overrideConfig,
      context: intent.context
    });
  }
  return triggerPipelineRunWithGating(tenantId, projectId, intent.pipelineId, token, {
    pipeline_id: intent.pipelineId,
    idempotency_key: intent.idempotencyKey,
    priority: intent.priority ?? "normal",
    max_parallel_tasks: intent.maxParallelTasks ?? 1,
    training_mode: intent.trainingMode,
    override_config: intent.overrideConfig,
    pipeline_version_id: intent.pipelineVersionId,
    use_latest_pipeline_version: intent.useLatestPipelineVersion,
    context: intent.context
  });
}
