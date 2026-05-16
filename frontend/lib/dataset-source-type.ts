/**
 * Maps stored `dataset_versions.source_type` / buffer `source_type` literals to a small canonical set
 * (see ROADMAP: Dataset lifecycle — source_type normalization).
 */

export type DatasetSourceTypeCanonical = "import" | "runtime_accumulated" | "manual" | "generated" | "unknown";

export function normalizeDatasetSourceType(raw: string | null | undefined): DatasetSourceTypeCanonical {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "unknown";

  if (
    s === "csv_import" ||
    s === "manual_upload" ||
    s === "import" ||
    s === "upload" ||
    s === "uploaded" ||
    s === "file_import"
  ) {
    return "import";
  }
  if (
    s === "runtime_feedback" ||
    s === "runtime_accumulation" ||
    s === "runtime_accumulated" ||
    s === "buffer_materialized" ||
    s === "accumulation"
  ) {
    return "runtime_accumulated";
  }
  if (s === "manual" || s === "manual_snapshot" || s === "manual_materialize") {
    return "manual";
  }
  if (s === "generated" || s === "synthetic" || s === "derived") {
    return "generated";
  }
  return "unknown";
}

/** Prefer server `canonical_source_type` when present; otherwise infer from stored literal. */
export function datasetVersionSourceBadge(version: {
  source_type?: string | null;
  canonical_source_type?: string | null;
}): { label: string; className: string } {
  const c = String(version.canonical_source_type || "").trim();
  if (c && c !== "unknown") {
    return datasetSourceTypeBadge(c);
  }
  return datasetSourceTypeBadge(version.source_type);
}

/** Badge for version rows / overview (canonical label + zinc shell colors). */
export function datasetSourceTypeBadge(sourceType: string | null | undefined): { label: string; className: string } {
  const k = normalizeDatasetSourceType(sourceType);
  const raw = String(sourceType || "").trim();
  const suffix = k === "unknown" && raw ? ` (${raw})` : "";

  switch (k) {
    case "import":
      return {
        label: `IMPORT${suffix}`,
        className: "border-sky-500/35 bg-sky-500/10 text-sky-300"
      };
    case "runtime_accumulated":
      return {
        label: `RUNTIME ACCUMULATED${suffix}`,
        className: "border-border bg-muted/80 text-muted-foreground"
      };
    case "manual":
      return {
        label: `MANUAL${suffix}`,
        className: "border-amber-500/35 bg-amber-500/10 text-amber-200"
      };
    case "generated":
      return {
        label: `GENERATED${suffix}`,
        className: "border-violet-500/35 bg-violet-500/10 text-violet-200"
      };
    default:
      return {
        label: (raw || "UNKNOWN").toUpperCase().replace(/_/g, " "),
        className: "border-border bg-card text-muted-foreground"
      };
  }
}
