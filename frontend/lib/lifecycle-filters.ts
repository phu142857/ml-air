import type { AuditTimelineFilters } from "@/lib/audit-timeline-filters";

/** Lifecycle UI → `GET .../audit/timeline` query filters (ROADMAP Phase 4). */
export type LifecycleSemanticFilters = {
  policyId?: string;
  datasetVersionId?: string;
  readinessStatus?: string;
  kind?: string;
  resourceType?: string;
  resourceId?: string;
};

export function toAuditTimelineFilters(filters: LifecycleSemanticFilters): AuditTimelineFilters {
  const out: AuditTimelineFilters = {};
  const policyId = filters.policyId?.trim();
  const datasetVersionId = filters.datasetVersionId?.trim();
  const readinessStatus = filters.readinessStatus?.trim();
  const kind = filters.kind?.trim();
  const resourceType = filters.resourceType?.trim();
  const resourceId = filters.resourceId?.trim();
  if (policyId) out.policyId = policyId;
  if (datasetVersionId) out.datasetVersionId = datasetVersionId;
  if (readinessStatus) out.readinessStatus = readinessStatus;
  if (kind) out.kind = kind;
  if (resourceType && resourceId) {
    out.resourceType = resourceType;
    out.resourceId = resourceId;
  }
  return out;
}

export function countActiveSemanticFilters(filters: LifecycleSemanticFilters): number {
  let n = 0;
  if (filters.policyId?.trim()) n++;
  if (filters.datasetVersionId?.trim()) n++;
  if (filters.readinessStatus?.trim()) n++;
  if (filters.kind?.trim()) n++;
  if (filters.resourceType?.trim() && filters.resourceId?.trim()) n++;
  return n;
}

export function lifecycleSemanticFiltersFromSearchParams(
  params: URLSearchParams,
): LifecycleSemanticFilters {
  return {
    policyId: params.get("policy_id") || undefined,
    datasetVersionId: params.get("dataset_version_id") || undefined,
    readinessStatus: params.get("readiness_status") || undefined,
    kind: params.get("kind") || undefined,
    resourceType: params.get("resource_type") || undefined,
    resourceId: params.get("resource_id") || undefined,
  };
}

const SEMANTIC_QUERY_KEYS = [
  "policy_id",
  "dataset_version_id",
  "readiness_status",
  "kind",
  "resource_type",
  "resource_id",
] as const;

/** Merge semantic filters into existing search params (preserves `trace`, etc.). */
export function applySemanticFiltersToSearchParams(
  base: URLSearchParams,
  filters: LifecycleSemanticFilters,
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  for (const key of SEMANTIC_QUERY_KEYS) next.delete(key);
  const policyId = filters.policyId?.trim();
  const datasetVersionId = filters.datasetVersionId?.trim();
  const readinessStatus = filters.readinessStatus?.trim();
  const kind = filters.kind?.trim();
  const resourceType = filters.resourceType?.trim();
  const resourceId = filters.resourceId?.trim();
  if (policyId) next.set("policy_id", policyId);
  if (datasetVersionId) next.set("dataset_version_id", datasetVersionId);
  if (readinessStatus) next.set("readiness_status", readinessStatus);
  if (kind) next.set("kind", kind);
  if (resourceType && resourceId) {
    next.set("resource_type", resourceType);
    next.set("resource_id", resourceId);
  }
  return next;
}
