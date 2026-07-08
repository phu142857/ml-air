/** Parse 32-char hex trace id from W3C ``traceparent`` (``version-traceid-parentid-flags``). */
export function traceIdFromTraceparent(traceparent: string | null | undefined): string | null {
  if (!traceparent || typeof traceparent !== "string") return null;
  const parts = traceparent.trim().split("-");
  if (parts.length >= 2 && /^[0-9a-f]{32}$/i.test(parts[1])) {
    return parts[1].toLowerCase();
  }
  return null;
}

/** Normalize trace ids (traceparent, UUID, 32-hex) for lookup and display. */
export function normalizeTraceId(traceId: string | null | undefined): string | null {
  if (!traceId || typeof traceId !== "string") return null;
  const trimmed = traceId.trim();
  if (!trimmed) return null;

  const fromTraceparent = traceIdFromTraceparent(trimmed);
  if (fromTraceparent) return fromTraceparent;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.replace(/-/g, "").toLowerCase();
  }

  if (/^[0-9a-f]{32}$/i.test(trimmed)) return trimmed.toLowerCase();
  return trimmed;
}

/** Whether a search string looks like a trace id. */
export function isTraceIdFormat(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  if (traceIdFromTraceparent(v)) return true;
  if (/^[0-9a-f]{32}$/i.test(v)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  return v.length >= 8 && /^[0-9a-f-]+$/i.test(v);
}
