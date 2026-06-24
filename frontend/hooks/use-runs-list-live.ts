"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { fetchRuns, fetchRunsPage, type RunItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mergeRunListRow } from "@/lib/execution-live-merge";
import { useExecutionStore } from "@/lib/execution-store";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";
import { isActiveExecutionStatus } from "@/lib/status-style";

const ACTIVE_RUN_REFETCH_MS = 4000;
const RUNS_PAGE_SIZE = 50;

function listHasActiveRun(items: RunItem[], storeRuns: Record<string, RunItem>): boolean {
  if (items.some((row) => isActiveExecutionStatus(row.status))) return true;
  return Object.values(storeRuns).some((row) => isActiveExecutionStatus(row.status));
}

function mergeRunsWithLiveStore(
  base: RunItem[],
  storeRuns: Record<string, RunItem>,
  tenantId: string,
  projectId: string,
): RunItem[] {
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
}

/** Runs list with React Query snapshot + live status overlay from the execution store. */
export function useRunsListLive(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();
  const storeRuns = useExecutionStore((s) => s.runs);
  const runLiveRevisions = useExecutionStore(
    useShallow((s) =>
      Object.values(s.runs).map((r) => `${r.run_id}\0${r.status ?? ""}\0${r.updated_at ?? ""}`),
    ),
  );

  const refetchInterval = (items: RunItem[]) => {
    const liveRuns = useExecutionStore.getState().runs;
    if (listHasActiveRun(items, liveRuns)) return ACTIVE_RUN_REFETCH_MS;
    return poll.refetchInterval;
  };

  const infiniteQuery = useInfiniteQuery({
    queryKey: mlairKeys.runs.listInfinite(tenantId, projectId),
    queryFn: ({ pageParam }) =>
      fetchRunsPage(tenantId, projectId, token, {
        limit: RUNS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    refetchOnMount: "always",
    refetchInterval: (q) => {
      const items = q.state.data?.pages.flatMap((p) => p.items) ?? [];
      return refetchInterval(items);
    },
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const aggregateQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: enabled && !scopePinned && Boolean(token?.trim()),
    refetchOnMount: "always",
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      return refetchInterval(items);
    },
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const query = scopePinned ? infiniteQuery : aggregateQuery;

  const baseItems = useMemo(() => {
    if (scopePinned) {
      return infiniteQuery.data?.pages.flatMap((p) => p.items) ?? [];
    }
    return aggregateQuery.data?.items ?? [];
  }, [scopePinned, infiniteQuery.data?.pages, aggregateQuery.data?.items]);

  useEffect(() => {
    if (!baseItems.length) return;
    useExecutionStore.getState().hydrateRunsFromList(baseItems);
  }, [baseItems]);

  const items = useMemo(
    () => mergeRunsWithLiveStore(baseItems, storeRuns, tenantId, projectId),
    [baseItems, storeRuns, runLiveRevisions, tenantId, projectId],
  );

  return {
    ...query,
    items,
    scopePinned,
    fetchNextPage: scopePinned ? infiniteQuery.fetchNextPage : undefined,
    hasNextPage: scopePinned ? infiniteQuery.hasNextPage : false,
    isFetchingNextPage: scopePinned ? infiniteQuery.isFetchingNextPage : false,
  };
}
