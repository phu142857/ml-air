"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTraceDetail, fetchTraceSearch } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";

const LIVE_TRACE_POLL_MS = 3_000;

export function useTraceDetail(
  tenantId: string,
  projectId: string,
  token: string,
  traceId: string | null | undefined,
  enabled = true,
) {
  const tid = String(traceId || "").trim();
  const scopeOk = tenantId !== "all" && projectId !== "all";
  return useQuery({
    queryKey: mlairKeys.trace.detail(tenantId, projectId, tid),
    queryFn: () => fetchTraceDetail(tenantId, projectId, token, tid),
    enabled: enabled && scopeOk && Boolean(token?.trim()) && Boolean(tid),
    staleTime: 5_000,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.is_live ? LIVE_TRACE_POLL_MS : false),
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
