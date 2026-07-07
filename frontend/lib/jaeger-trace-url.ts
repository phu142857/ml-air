/** Parse 32-char hex trace id from W3C ``traceparent`` (``version-traceid-parentid-flags``). */
export function traceIdFromTraceparent(traceparent: string | null | undefined): string | null {
  if (!traceparent || typeof traceparent !== "string") return null;
  const parts = traceparent.trim().split("-");
  if (parts.length >= 2 && /^[0-9a-f]{32}$/i.test(parts[1])) {
    return parts[1].toLowerCase();
  }
  return null;
}

/** Normalize trace ids for Jaeger UI deep links (traceparent, UUID, 32-hex). */
export function normalizeJaegerTraceId(traceId: string | null | undefined): string | null {
  if (!traceId || typeof traceId !== "string") return null;
  const trimmed = traceId.trim();
  if (!trimmed) return null;

  const fromTraceparent = traceIdFromTraceparent(trimmed);
  if (fromTraceparent) return fromTraceparent;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.replace(/-/g, "").toLowerCase();
  }

  return trimmed;
}

/** Jaeger UI deep link for a trace (all-in-one UI ``/trace/{traceId}``). */
export function jaegerTraceDeepLink(jaegerUiBaseUrl: string, traceparent: string | null | undefined): string | null {
  const tid = traceIdFromTraceparent(traceparent);
  if (!tid) return null;
  const base = jaegerUiBaseUrl.replace(/\/$/, "");
  return `${base}/trace/${encodeURIComponent(tid)}`;
}

/** Build Jaeger UI trace URL from a base URL and any supported trace id format. */
export function buildJaegerTraceUrl(jaegerUiBaseUrl: string, traceId: string): string | null {
  const tid = normalizeJaegerTraceId(traceId);
  if (!tid) return null;
  const base = jaegerUiBaseUrl.replace(/\/$/, "");
  return `${base}/trace/${encodeURIComponent(tid)}`;
}
