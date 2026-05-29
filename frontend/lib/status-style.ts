export type StatusTone = "SUCCESS" | "FAILED" | "RUNNING" | "QUEUED" | "PENDING" | "CANCELLED";
export type DatasetStatusTone = "READY" | "WARNING" | "FAILED";

export type StatusChipKey =
  | "queued"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

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
  QUEUED: "QUEUED",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
};

const successChip =
  "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]";
const failedChip =
  "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]";
const pendingChip =
  "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]";
const runningChip = "border-primary/30 bg-primary/10 text-primary";
const neutralChip = "border-border/60 bg-muted text-muted-foreground";

export const STATUS_CHIP_CLASS: Record<StatusChipKey, string> = {
  queued: neutralChip,
  pending: pendingChip,
  running: runningChip,
  success: successChip,
  failed: failedChip,
  cancelled: neutralChip,
};

export const STATUS_CHIP_TEXT: Record<StatusChipKey, string> = {
  queued: "text-muted-foreground",
  pending: "text-[color:var(--status-pending-fg)]",
  running: "text-primary",
  success: "text-[color:var(--status-success-fg)]",
  failed: "text-[color:var(--status-failed-fg)]",
  cancelled: "text-muted-foreground",
};

export const STATUS_CHIP_BG: Record<StatusChipKey, string> = {
  queued: "bg-muted",
  pending: "bg-[color:var(--status-pending-bg)]",
  running: "bg-primary/10",
  success: "bg-[color:var(--status-success-bg)]",
  failed: "bg-[color:var(--status-failed-bg)]",
  cancelled: "bg-muted",
};

export function normalizeStatus(raw: string | null | undefined): StatusTone {
  const key = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return ALIASES[key] || "PENDING";
}

export function statusChipKey(raw: string | null | undefined): StatusChipKey {
  const s = normalizeStatus(raw);
  if (s === "SUCCESS") return "success";
  if (s === "FAILED") return "failed";
  if (s === "RUNNING") return "running";
  if (s === "QUEUED") return "queued";
  if (s === "CANCELLED") return "cancelled";
  return "pending";
}

/** Tailwind chip classes — aligned with StatusBadge CSS variables. */
export function statusBadgeClass(status: string | null | undefined): string {
  return STATUS_CHIP_CLASS[statusChipKey(status)];
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
  if (s === "FAILED") return failedChip;
  if (s === "WARNING") return pendingChip;
  return successChip;
}

/** Map API status strings to `StatusBadge` variants. */
export function statusToMlopsBadge(
  raw: string | null | undefined,
): "success" | "failed" | "running" | "pending" | "cancelled" | "warning" {
  const s = normalizeStatus(raw);
  if (s === "SUCCESS") return "success";
  if (s === "FAILED") return "failed";
  if (s === "RUNNING") return "running";
  if (s === "CANCELLED") return "cancelled";
  if (s === "QUEUED") return "pending";
  return "pending";
}
