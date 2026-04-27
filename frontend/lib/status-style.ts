export type StatusTone = "SUCCESS" | "FAILED" | "RUNNING" | "PENDING";

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
  QUEUED: "PENDING"
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
  return "status-badge warning";
}
