/**
 * Canonical TanStack Query keys for MLAir UI.
 * Scope order: domain → tenantId → projectId → entity ids (stable invalidation + realtime alignment).
 */

import { auditTimelineFilterKey, type AuditTimelineFilters } from "./audit-timeline-filters";

export const mlairKeys = {
  plugins: {
    all: () => ["plugins"] as const
  },
  runs: {
    list: (tenantId: string, projectId: string) => ["runs", tenantId, projectId] as const
  },
  run: {
    detail: (runId: string) => ["run", runId] as const,
    executionGraph: (tenantId: string, projectId: string, runId: string) =>
      ["run-execution-graph", tenantId, projectId, runId] as const,
    tasks: (runId: string) => ["run-tasks", runId] as const,
    logs: (runId: string) => ["run-logs", runId] as const,
    tracking: (runId: string) => ["run-tracking", runId] as const,
    readiness: (runId: string) => ["run-readiness", runId] as const
  },
  task: {
    detail: (taskId: string, scopeKey = "") => ["task", taskId, scopeKey] as const
  },
  tasks: {
    /** Recent tasks fan-out from recent runs (Tasks tab). */
    recent: (tenantId: string, projectId: string, runsFingerprint: string) =>
      ["tasks-recent", tenantId, projectId, runsFingerprint] as const,
    recentPrefix: (tenantId: string, projectId: string) => ["tasks-recent", tenantId, projectId] as const
  },
  datasets: {
    list: (tenantId: string, projectId: string) => ["datasets", tenantId, projectId] as const,
    detail: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset", tenantId, projectId, datasetId] as const,
    buffer: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-buffer", tenantId, projectId, datasetId] as const,
    readinessEvaluations: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-readiness-evaluations", tenantId, projectId, datasetId] as const,
    /** GET .../eligibility (per-policy rows); invalidate with `exact: false` for all version-scoped fetches. */
    trainingEligibility: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-training-eligibility", tenantId, projectId, datasetId] as const,
    /** Prefix for all eligibility rows in a project (use with `exact: false`, e.g. `model.eligibility.updated`). */
    trainingEligibilityProjectPrefix: (tenantId: string, projectId: string) =>
      ["dataset-training-eligibility", tenantId, projectId] as const,
    trainingPolicies: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-training-policies", tenantId, projectId, datasetId] as const,
    retentionPolicy: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-retention-policy", tenantId, projectId, datasetId] as const,
    retentionPreview: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-retention-preview", tenantId, projectId, datasetId] as const,
    versions: (tenantId: string, projectId: string, datasetId: string) =>
      ["dataset-versions", tenantId, projectId, datasetId] as const,
    versionPreview: (tenantId: string, projectId: string, versionId: string) =>
      ["dataset-version-preview", tenantId, projectId, versionId] as const,
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
      ["model-gate-freshness", tenantId, projectId, fingerprint] as const,
    promotionEligibility: (
      tenantId: string,
      projectId: string,
      modelId: string,
      version: number,
      targetStage: string
    ) => ["model-promotion-eligibility", tenantId, projectId, modelId, version, targetStage] as const
  },
  execution: {
    projection: (tenantId: string, projectId: string) =>
      ["execution-projection", tenantId, projectId] as const,
  },
  pipelines: {
    list: (tenantId: string, projectId: string) => ["pipelines", tenantId, projectId] as const,
    topology: (tenantId: string, projectId: string, pipelineId: string) =>
      ["pipeline-topology", tenantId, projectId, pipelineId] as const,
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
  audit: {
    timeline: (tenantId: string, projectId: string, filters: AuditTimelineFilters = {}) =>
      ["audit-timeline", tenantId, projectId, auditTimelineFilterKey(filters)] as const
  },
  search: (tenantId: string, projectId: string, q: string, type: string) =>
    ["search", q, type, tenantId, projectId] as const,
  lifecycle: (tenantId: string, projectId: string) =>
    ["lifecycle", tenantId, projectId] as const,
  jaegerStatus: (jaegerUrl: string) => ["jaeger", "status", jaegerUrl] as const
};
