/** Parse 32-char hex trace id from W3C ``traceparent`` (``version-traceid-parentid-flags``). */
export function traceIdFromTraceparent(traceparent: string | null | undefined): string | null {
  if (!traceparent || typeof traceparent !== "string") return null;
  const parts = traceparent.trim().split("-");
  if (parts.length >= 2 && /^[0-9a-f]{32}$/i.test(parts[1])) {
    return parts[1].toLowerCase();
  }
  return null;
}

/** Jaeger UI deep link for a trace (all-in-one UI ``/trace/{traceId}``). */
export function jaegerTraceDeepLink(jaegerUiBaseUrl: string, traceparent: string | null | undefined): string | null {
  const tid = traceIdFromTraceparent(traceparent);
  if (!tid) return null;
  const base = jaegerUiBaseUrl.replace(/\/$/, "");
  return `${base}/trace/${encodeURIComponent(tid)}`;
}
