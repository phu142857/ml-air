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

/** Tailwind chip classes (pair with `rounded-full border px-2 …`). */
export function statusBadgeClass(status: string | null | undefined): string {
  const s = normalizeStatus(status);
  if (s === "SUCCESS") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  if (s === "FAILED") return "border-red-500/40 bg-red-500/15 text-red-300";
  if (s === "RUNNING") return "border-sky-500/40 bg-sky-500/15 text-sky-300";
  if (s === "QUEUED") return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  return "border-zinc-600 bg-zinc-800/80 text-zinc-400";
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
  if (s === "FAILED") return "border-red-500/40 bg-red-500/15 text-red-300";
  if (s === "WARNING") return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
}
