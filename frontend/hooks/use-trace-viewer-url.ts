"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  buildTraceViewerSearchParams,
  parseTraceViewerUrl,
  type TraceViewerUrlState,
} from "@/lib/trace-url-state";

type TraceViewerUrlPatch = Partial<TraceViewerUrlState>;

function mergeUrlState(current: TraceViewerUrlState, patch: TraceViewerUrlPatch): TraceViewerUrlState {
  return {
    traceId: patch.traceId !== undefined ? patch.traceId : current.traceId,
    spanId: patch.spanId !== undefined ? patch.spanId : current.spanId,
    zoom: patch.zoom !== undefined ? patch.zoom : current.zoom,
    q: patch.q !== undefined ? patch.q : current.q,
  };
}

export function useTraceViewerUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => parseTraceViewerUrl(searchParams), [searchParams]);

  const replaceUrl = useCallback(
    (patch: TraceViewerUrlPatch) => {
      const next = mergeUrlState(state, patch);
      const sp = buildTraceViewerSearchParams(next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );

  const setTraceId = useCallback(
    (traceId: string | null) => {
      replaceUrl({
        traceId,
        spanId: null,
        zoom: null,
        q: "",
      });
    },
    [replaceUrl],
  );

  const setSpanId = useCallback(
    (spanId: string | null) => {
      replaceUrl({ spanId });
    },
    [replaceUrl],
  );

  const setZoom = useCallback(
    (zoom: [number, number] | null) => {
      replaceUrl({ zoom });
    },
    [replaceUrl],
  );

  const setQ = useCallback(
    (q: string) => {
      replaceUrl({ q });
    },
    [replaceUrl],
  );

  return {
    ...state,
    setTraceId,
    setSpanId,
    setZoom,
    setQ,
    replaceUrl,
  };
}
