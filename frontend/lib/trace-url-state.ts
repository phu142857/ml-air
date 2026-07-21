export type TraceViewerUrlState = {
  traceId: string | null;
  spanId: string | null;
  zoom: [number, number] | null;
  q: string;
};

export function parseZoomParam(value: string | null | undefined): [number, number] | null {
  if (!value?.trim()) return null;
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return [min, max];
}

export function formatZoomParam(zoom: [number, number]): string {
  return `${zoom[0]}-${zoom[1]}`;
}

export function parseTraceViewerUrl(searchParams: URLSearchParams): TraceViewerUrlState {
  const traceId = (searchParams.get("trace") || "").trim() || null;
  const spanId = (searchParams.get("span") || "").trim() || null;
  const q = searchParams.get("q") ?? "";
  const zoom = parseZoomParam(searchParams.get("zoom"));
  return { traceId, spanId, zoom, q };
}

export function buildTraceViewerSearchParams(state: TraceViewerUrlState): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.traceId) sp.set("trace", state.traceId);
  if (state.spanId) sp.set("span", state.spanId);
  if (state.q.trim()) sp.set("q", state.q.trim());
  if (state.zoom) sp.set("zoom", formatZoomParam(state.zoom));
  return sp;
}

export type TraceShareUrlOptions = {
  spanId?: string | null;
  zoom?: [number, number] | null;
  q?: string;
  origin?: string;
};

export function buildTraceShareUrl(traceId: string, options: TraceShareUrlOptions = {}): string {
  const origin =
    options.origin ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const sp = buildTraceViewerSearchParams({
    traceId: traceId.trim(),
    spanId: options.spanId?.trim() || null,
    zoom: options.zoom ?? null,
    q: options.q?.trim() ?? "",
  });
  const qs = sp.toString();
  return qs ? `${origin}/traces?${qs}` : `${origin}/traces?trace=${encodeURIComponent(traceId.trim())}`;
}
