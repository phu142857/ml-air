import type { ActivityFeedItem } from "@/lib/api";

export type ActivityScopeType = "all" | "model" | "dataset" | "pipeline" | "run" | "project";

export const ACTIVITY_SCOPE_OPTIONS: { id: ActivityScopeType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "model", label: "Models" },
  { id: "dataset", label: "Datasets" },
  { id: "pipeline", label: "Pipelines" },
  { id: "run", label: "Runs" },
  { id: "project", label: "Project" },
];

export function activityResourceHref(item: ActivityFeedItem): string | null {
  const id = String(item.scope_id || "").trim();
  if (!id) return null;
  switch (item.scope_type) {
    case "model":
      return `/models/${encodeURIComponent(id)}`;
    case "dataset":
      return `/datasets/${encodeURIComponent(id)}`;
    case "pipeline":
      return `/pipelines/${encodeURIComponent(id)}`;
    case "run":
      return `/runs/${encodeURIComponent(id)}`;
    default:
      return null;
  }
}

export function activityVerbLabel(verb: string): string {
  const v = String(verb || "").trim().toLowerCase();
  const map: Record<string, string> = {
    promoted: "promoted",
    rollback: "rolled back",
    approved: "approved",
    rejected: "rejected",
    created: "created",
    deleted: "deleted",
    version_created: "created version",
    running: "is running",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
    readiness_evaluated: "readiness evaluated",
  };
  return map[v] ?? v.replace(/_/g, " ");
}
