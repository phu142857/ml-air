export type StatusTone = "SUCCESS" | "FAILED" | "RUNNING" | "QUEUED" | "PENDING";
export type DatasetStatusTone = "READY" | "WARNING" | "FAILED";

const ALIASES: Record<string, StatusTone> = {
  SUCCESS: "SUCCESS",
  SUCCEEDED: "SUCCESS",
  OK: "SUCCESS",
  FAILED: "FAILED",
  FAIL: "FAILED",
  ERROR: "FAILED",
  RUNNING: "RUNNING",
  IN_PROGRESS: "RUNNING",
  PENDING: "PENDING",
  QUEUED: "QUEUED"
};

export function normalizeStatus(raw: string | null | undefined): StatusTone {
  const key = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return ALIASES[key] || "PENDING";
}

/** Tailwind chip classes — light/dark aligned with reDesign StatusBadge. */
export function statusBadgeClass(status: string | null | undefined): string {
  const s = normalizeStatus(status);
  if (s === "SUCCESS")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (s === "FAILED") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
  if (s === "RUNNING") return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400";
  if (s === "QUEUED") return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400";
  return "border-border bg-muted text-muted-foreground";
}

export function normalizeDatasetStatus(raw: string | null | undefined): DatasetStatusTone {
  const key = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (key === "FAILED" || key === "ERROR") return "FAILED";
  if (key === "WARNING" || key === "WARN") return "WARNING";
  return "READY";
}

export function datasetStatusBadgeClass(status: string | null | undefined): string {
  const s = normalizeDatasetStatus(status);
  if (s === "FAILED") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
  if (s === "WARNING") return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

/** Map API status strings to `StatusBadge` variants. */
export function statusToMlopsBadge(
  raw: string | null | undefined,
): "success" | "failed" | "running" | "pending" | "cancelled" | "warning" {
  const s = normalizeStatus(raw);
  if (s === "SUCCESS") return "success";
  if (s === "FAILED") return "failed";
  if (s === "RUNNING") return "running";
  if (s === "QUEUED") return "pending";
  return "pending";
}
