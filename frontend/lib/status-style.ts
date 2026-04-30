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

export function statusBadgeClass(status: string | null | undefined): string {
  const s = normalizeStatus(status);
  if (s === "SUCCESS") return "status-badge success";
  if (s === "FAILED") return "status-badge error";
  if (s === "RUNNING") return "status-badge info";
  if (s === "QUEUED") return "status-badge warning";
  return "status-badge warning";
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
  if (s === "FAILED") return "status-badge error";
  if (s === "WARNING") return "status-badge warning";
  return "status-badge success";
}
