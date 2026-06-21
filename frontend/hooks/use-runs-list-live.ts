"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { fetchRuns, type RunItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mergeRunListRow } from "@/lib/execution-live-merge";
import { useExecutionStore } from "@/lib/execution-store";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isActiveExecutionStatus } from "@/lib/status-style";

const ACTIVE_RUN_REFETCH_MS = 4000;

function listHasActiveRun(items: RunItem[], storeRuns: Record<string, RunItem>): boolean {
  if (items.some((row) => isActiveExecutionStatus(row.status))) return true;
  return Object.values(storeRuns).some((row) => isActiveExecutionStatus(row.status));
}

/** Runs list with React Query snapshot + live status overlay from the execution store. */
export function useRunsListLive(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const poll = useRealtimeQueryPolling();
  const storeRuns = useExecutionStore((s) => s.runs);
  const runLiveRevisions = useExecutionStore(
    useShallow((s) =>
      Object.values(s.runs).map((r) => `${r.run_id}\0${r.status ?? ""}\0${r.updated_at ?? ""}`),
    ),
  );

  const query = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: enabled && Boolean(token?.trim()),
    refetchOnMount: "always",
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const liveRuns = useExecutionStore.getState().runs;
      if (listHasActiveRun(items, liveRuns)) return ACTIVE_RUN_REFETCH_MS;
      return poll.refetchInterval;
    },
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  useEffect(() => {
    const rows = query.data?.items;
    if (!rows?.length) return;
    useExecutionStore.getState().hydrateRunsFromList(rows);
  }, [query.data?.items]);

  const items = useMemo(() => {
    const base = query.data?.items ?? [];
    const byId = new Map<string, RunItem>();
    for (const row of base) {
      byId.set(row.run_id, row);
    }
    for (const live of Object.values(storeRuns)) {
      if (!live?.run_id || !live.status) continue;
      const prev = byId.get(live.run_id);
      if (prev) {
        byId.set(live.run_id, mergeRunListRow(prev, live));
      } else if (live.pipeline_id) {
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
  }, [query.data?.items, storeRuns, runLiveRevisions, tenantId, projectId]);

  return { ...query, items };
}
