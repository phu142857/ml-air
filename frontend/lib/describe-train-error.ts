/** Maps API errors from train/run trigger endpoints to user-facing copy. */
export function describeTrainError(err: unknown): string {
  const fallback = String((err as { message?: string })?.message || err || "Unknown error");
  try {
    const parsed = JSON.parse(fallback) as Record<string, unknown>;
    const detail = parsed.detail;
    if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
      const d = detail as Record<string, unknown>;
      const reason = String(d.reason || "blocked");
      const details = String(d.details || "");
      if (reason === "PIPELINE_INPUT_REQUIRED_SIZE_NOT_MET") {
        const reasons = d.reasons as Array<{ message?: string; dataset?: string }> | undefined;
        if (Array.isArray(reasons) && reasons[0]?.message) {
          return `Pipeline input not ready: ${reasons[0].message}`;
        }
        return details || "Pipeline input required_size not met for one or more declared datasets.";
      }
      if (reason === "MLAIR_READINESS_NOT_ELIGIBLE") {
        const readiness = d.readiness as { eligibility_criteria?: Array<{ label?: string; code?: string; status?: string }> } | undefined;
        const failing = (readiness?.eligibility_criteria || []).filter((c) => String(c.status).toLowerCase() === "fail");
        if (failing.length) {
          const labels = failing.map((c) => c.label || c.code).filter(Boolean).join(", ");
          return `Training blocked (MLair policy): ${labels}`;
        }
        return details || "Training blocked: dataset version does not meet MLAir training policy.";
      }
      return details ? `Train blocked (${reason}): ${details}` : `Train blocked (${reason})`;
    }
    if (typeof detail === "string" && detail.trim()) return `Train failed: ${detail}`;
  } catch {
    /* not JSON */
  }
  return `Train failed: ${fallback}`;
}
