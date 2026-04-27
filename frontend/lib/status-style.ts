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
  if (s === "SUCCESS") return "border-[#16A34A] bg-[#DCFCE7] text-[#166534]";
  if (s === "FAILED") return "border-[#DC2626] bg-[#FEE2E2] text-[#7F1D1D]";
  if (s === "RUNNING") return "border-[#2563EB] bg-[#DBEAFE] text-[#1E3A8A]";
  return "border-[#D97706] bg-[#FEF3C7] text-[#78350F]";
}
