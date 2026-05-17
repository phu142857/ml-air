/** Maps API errors from train/run trigger endpoints to user-facing copy. */
export function describeTrainError(err: unknown): string {
  const fallback = String((err as { message?: string })?.message || err || "Unknown error");
  try {
    const parsed = JSON.parse(fallback) as Record<string, unknown>;
    const detail = parsed.detail;
    if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
      const reason = String((detail as Record<string, unknown>).reason || "blocked");
      const details = String((detail as Record<string, unknown>).details || "");
      return details ? `Train blocked (${reason}): ${details}` : `Train blocked (${reason})`;
    }
    if (typeof detail === "string" && detail.trim()) return `Train failed: ${detail}`;
  } catch {
    /* not JSON */
  }
  return `Train failed: ${fallback}`;
}
