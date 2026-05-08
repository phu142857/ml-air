/**
 * Canonical TanStack Query keys for MLAir UI.
 * Scope order: domain → tenantId → projectId → entity ids (stable invalidation + realtime alignment).
 */

export const mlairKeys = {
  plugins: {
    all: () => ["plugins"] as const
  },
  runs: {
    list: (tenantId: string, projectId: string) => ["runs", tenantId, projectId] as const
  },
  run: {
    detail: (runId: string) => ["run", runId] as const,
    tasks: (runId: string) => ["run-tasks", runId] as const,
    logs: (runId: string) => ["run-logs", runId] as const,
    tracking: (runId: string) => ["run-tracking", runId] as const,
    readiness: (runId: string) => ["run-readiness", runId] as const
  },
  task: {
    detail: (taskId: string) => ["task", taskId] as const
  },
  datasets: {
    list: (tenantId: string, projectId: string) => ["datasets", tenantId, projectId] as const,
    detail: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset", tenantId, projectId, datasetId] as const,
    buffer: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-buffer", tenantId, projectId, datasetId] as const,
    readinessEvaluations: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-readiness-evaluations", tenantId, projectId, datasetId] as const,
    trainingPolicies: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-training-policies", tenantId, projectId, datasetId] as const,
    versions: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-versions", tenantId, projectId, datasetId] as const,
    readiness: (tenantId: string, projectId: string, datasetId: string, requiredSize: number) =>
      ["dataset-readiness", tenantId, projectId, datasetId, requiredSize] as const
  },
  datasetVersion: {
    detail: (tenantId: string, projectId: string, versionId: string) =>
      ["dataset-version", versionId, tenantId, projectId] as const
  },
  datasetRuns: (tenantId: string, projectId: string, datasetId: string) =>
    ["dataset-runs", datasetId, tenantId, projectId] as const,
  models: {
    list: (tenantId: string, projectId: string) => ["models", tenantId, projectId] as const,
    versions: (tenantId: string, projectId: string, modelId: string) =>
      ["model-versions", tenantId, projectId, modelId] as const,
    /** Single key for GET resolved-pipeline everywhere (replaces *-ui suffix). */
    resolvedPipeline: (tenantId: string, projectId: string, modelId: string) =>
      ["model-resolved-pipeline", tenantId, projectId, modelId] as const,
    status: (tenantId: string, projectId: string, modelId: string) =>
      ["model-status", tenantId, projectId, modelId] as const,
    statusRun: (tenantId: string, projectId: string, runId: string | undefined) =>
      ["model-status-run", tenantId, projectId, runId] as const,
    recentRuns: (tenantId: string, projectId: string, modelId: string, fingerprint: string) =>
      ["model-recent-runs", tenantId, projectId, modelId, fingerprint] as const,
    triggerPolicy: (tenantId: string, projectId: string, modelId: string) =>
      ["model-trigger-policy", tenantId, projectId, modelId] as const,
    serving: (tenantId: string, projectId: string, modelId: string) =>
      ["model-serving", tenantId, projectId, modelId] as const,
    nextArtifact: (tenantId: string, projectId: string, modelId: string) =>
      ["model-next-artifact", tenantId, projectId, modelId] as const,
    gateFreshness: (tenantId: string, projectId: string, fingerprint: string) =>
      ["model-gate-freshness", tenantId, projectId, fingerprint] as const
  },
  pipelines: {
    list: (tenantId: string, projectId: string) => ["pipelines", tenantId, projectId] as const,
    dag: (tenantId: string, projectId: string, pipelineId: string) =>
      ["pipeline-dag", tenantId, projectId, pipelineId] as const,
    versions: (tenantId: string, projectId: string, pipelineId: string) =>
      ["pipeline-versions", tenantId, projectId, pipelineId] as const,
    diff: (tenantId: string, projectId: string, leftId: string, rightId: string) =>
      ["pipeline-diff", leftId, rightId, tenantId, projectId] as const
  },
  lineage: {
    run: (tenantId: string, projectId: string, runId: string) =>
      ["lineage-run", runId, tenantId, projectId] as const,
    neighborhood: (tenantId: string, projectId: string, center: string) =>
      ["lineage-nb", center, tenantId, projectId] as const
  },
  search: (tenantId: string, projectId: string, q: string, type: string) =>
    ["search", q, type, tenantId, projectId] as const
};
