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
  ELIGIBLE: "SUCCESS",
  READY: "SUCCESS",
  FAILED: "FAILED",
  FAIL: "FAILED",
  ERROR: "FAILED",
  BLOCKED: "FAILED",
  NOT_ELIGIBLE: "FAILED",
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

/** Bordered callout shells — pair with semantic text classes inside. */
export const STATUS_CALLOUT_CLASS = {
  failed: `rounded-xl border px-4 py-3 text-sm ${failedChip}`,
  failedCompact: `rounded-md border px-2 py-1.5 text-xs ${failedChip}`,
  warning: `rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${pendingChip}`,
  warningCompact: `rounded-md border px-2 py-1.5 text-xs ${pendingChip}`,
} as const;

export type FeedbackTone = "success" | "failed" | "warning" | "neutral";

/** Inline feedback copy (messages, hints) without a bordered shell. */
export function feedbackMessageClass(
  tone: FeedbackTone,
  size: "xs" | "sm" = "xs",
): string {
  const base = size === "sm" ? "text-sm" : "text-xs";
  switch (tone) {
    case "success":
      return `${base} text-[color:var(--status-success-fg)]`;
    case "failed":
      return `${base} ${STATUS_CHIP_TEXT.failed}`;
    case "warning":
      return `${base} text-[color:var(--status-pending-fg)]`;
    default:
      return `${base} text-muted-foreground`;
  }
}

export function normalizeStatus(raw: string | null | undefined): StatusTone {
  const key = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return ALIASES[key] || "PENDING";
}

/** Run/task still in-flight — use faster React Query polling while active. */
export function isActiveExecutionStatus(raw: string | null | undefined): boolean {
  const s = normalizeStatus(raw);
  return s === "RUNNING" || s === "PENDING" || s === "QUEUED";
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

/** Dataset / training readiness labels (`eligible`, `blocked`, `ready`, …). */
export function readinessStatusChipClass(status: string | null | undefined): string {
  const key = String(status || "")
    .trim()
    .toLowerCase();
  if (key === "eligible" || key === "ready") return STATUS_CHIP_CLASS.success;
  if (key === "blocked" || key === "fail" || key === "failed" || key === "not_eligible") {
    return STATUS_CHIP_CLASS.failed;
  }
  return STATUS_CHIP_CLASS.pending;
}

export function readinessStatusTextClass(status: string | null | undefined): string {
  const key = String(status || "")
    .trim()
    .toLowerCase();
  if (key === "eligible" || key === "ready") return STATUS_CHIP_TEXT.success;
  if (key === "blocked" || key === "fail" || key === "failed" || key === "not_eligible") {
    return STATUS_CHIP_TEXT.failed;
  }
  return STATUS_CHIP_TEXT.pending;
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
