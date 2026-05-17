/**
 * Intent-driven execution façade: model+dataset (Hub train) or explicit pipeline run.
 */
import { triggerPipelineRunWithGating, triggerRunFromModelDataset } from "./api";
import { recordTrainIntentTelemetry } from "./train-intent-telemetry";

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
  datasetId?: string;
  datasetVersionId?: string;
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
    recordTrainIntentTelemetry({
      intent: "hub_train_model",
      tenant_id: tenantId,
      project_id: projectId,
      dataset_id: intent.datasetId,
      model_id: intent.modelId,
    });
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
  recordTrainIntentTelemetry({
    intent: "hub_run_pipeline",
    tenant_id: tenantId,
    project_id: projectId,
    pipeline_id: intent.pipelineId,
    dataset_id: intent.datasetId,
  });
  return triggerPipelineRunWithGating(tenantId, projectId, intent.pipelineId, token, {
    pipeline_id: intent.pipelineId,
    idempotency_key: intent.idempotencyKey,
    priority: intent.priority ?? "normal",
    max_parallel_tasks: intent.maxParallelTasks ?? 1,
    training_mode: intent.trainingMode,
    dataset_version_id: intent.datasetVersionId,
    override_config: intent.overrideConfig,
    pipeline_version_id: intent.pipelineVersionId,
    use_latest_pipeline_version: intent.useLatestPipelineVersion,
    context: intent.context
  });
}
