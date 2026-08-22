"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchLifecycleProjection } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

export function useLifecycleProjection(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  return useQuery({
    queryKey: mlairKeys.lifecycleProjection(tenantId, projectId),
    queryFn: () => fetchLifecycleProjection(tenantId, projectId, token),
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    ...poll,
  });
}
