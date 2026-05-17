"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchRuns, type RunItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { useExecutionStore } from "@/lib/execution-store";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

/** Runs list with React Query snapshot + live status overlay from the execution store. */
export function useRunsListLive(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const poll = useRealtimeQueryPolling();
  const storeRuns = useExecutionStore((s) => s.runs);

  const query = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: enabled && Boolean(token?.trim()),
    refetchOnMount: "always",
    ...poll,
  });

  const items = useMemo(() => {
    const base = query.data?.items ?? [];
    const byId = new Map<string, RunItem>();
    for (const row of base) {
      byId.set(row.run_id, row);
    }
    for (const live of Object.values(storeRuns)) {
      if (!live?.run_id) continue;
      const prev = byId.get(live.run_id);
      if (prev) {
        byId.set(live.run_id, {
          ...prev,
          ...live,
          status: live.status ?? prev.status,
          updated_at: live.updated_at ?? prev.updated_at,
          pipeline_id: live.pipeline_id || prev.pipeline_id,
        });
      } else if (live.pipeline_id && live.status) {
        byId.set(live.run_id, {
          run_id: live.run_id,
          tenant_id: live.tenant_id || tenantId,
          project_id: live.project_id || projectId,
          pipeline_id: live.pipeline_id,
          status: live.status,
          updated_at: live.updated_at,
          created_at: live.created_at,
        });
      }
    }
    const merged = [...byId.values()];
    merged.sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.created_at || "") || 0;
      const tb = Date.parse(b.updated_at || b.created_at || "") || 0;
      return tb - ta;
    });
    return merged;
  }, [query.data?.items, storeRuns, tenantId, projectId]);

  return { ...query, items };
}
