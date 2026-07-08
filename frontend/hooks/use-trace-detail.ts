"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTraceDetail } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";

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
    staleTime: 15_000,
    retry: 1,
  });
}
