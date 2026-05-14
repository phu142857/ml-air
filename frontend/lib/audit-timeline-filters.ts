/** Query + cache key for `GET .../audit/timeline` (and export) filters. */
export type AuditTimelineFilters = {
  resourceType?: string;
  resourceId?: string;
  kind?: string;
  source?: string;
  policyId?: string;
  datasetVersionId?: string;
  readinessStatus?: string;
};

export function auditTimelineFilterKey(filters: AuditTimelineFilters): string {
  const entries = Object.entries(filters)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([k, v]) => [k, (v as string).trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? "" : JSON.stringify(Object.fromEntries(entries));
}

export function buildAuditTimelineSearchParams(filters: AuditTimelineFilters, limit: number): string {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  const rt = filters.resourceType?.trim();
  const rid = filters.resourceId?.trim();
  if (rt && rid) {
    p.set("resource_type", rt);
    p.set("resource_id", rid);
  }
  if (filters.kind?.trim()) p.set("kind", filters.kind.trim());
  if (filters.source?.trim()) p.set("source", filters.source.trim());
  if (filters.policyId?.trim()) p.set("policy_id", filters.policyId.trim());
  if (filters.datasetVersionId?.trim()) p.set("dataset_version_id", filters.datasetVersionId.trim());
  if (filters.readinessStatus?.trim()) p.set("readiness_status", filters.readinessStatus.trim());
  return p.toString();
}
