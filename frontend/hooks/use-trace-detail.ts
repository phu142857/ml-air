"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTraceDetail, fetchTraceSearch } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { resolveRefetchInterval, useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const LIVE_TRACE_POLL_MS = 2_000;

export function useTraceDetail(
  tenantId: string,
  projectId: string,
  token: string,
  traceId: string | null | undefined,
  enabled = true,
) {
  const tid = String(traceId || "").trim();
  const scopeOk = tenantId !== "all" && projectId !== "all";
  const poll = useRealtimeQueryPolling();
  return useQuery({
    queryKey: mlairKeys.trace.detail(tenantId, projectId, tid),
    queryFn: () => fetchTraceDetail(tenantId, projectId, token, tid),
    enabled: enabled && scopeOk && Boolean(token?.trim()) && Boolean(tid),
    staleTime: 5_000,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.is_live
        ? resolveRefetchInterval(poll, { active: true, activeMs: LIVE_TRACE_POLL_MS })
        : false,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });
}

export function useTraceSearch(
  tenantId: string,
  projectId: string,
  token: string,
  query: string,
  enabled = true,
) {
  const q = query.trim();
  const scopeOk = tenantId !== "all" && projectId !== "all";
  return useQuery({
    queryKey: mlairKeys.trace.search(tenantId, projectId, q),
    queryFn: () => fetchTraceSearch(tenantId, projectId, token, q, 20),
    enabled: enabled && scopeOk && Boolean(token?.trim()) && q.length >= 4,
    staleTime: 10_000,
  });
}
