"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchDatasetRunsPage, type RunItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

const DATASET_RUNS_PAGE_SIZE = 20;

/** Runs that consumed a dataset (cursor pagination). */
export function useDatasetRuns(datasetId: string, enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.datasetRunsInfinite(tenantId, projectId, datasetId),
    queryFn: ({ pageParam }) =>
      fetchDatasetRunsPage(tenantId, projectId, datasetId, token, {
        limit: DATASET_RUNS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(datasetId && token?.trim()),
    ...poll,
  });

  const items: RunItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    scopePinned,
    pageSize: DATASET_RUNS_PAGE_SIZE,
  };
}
