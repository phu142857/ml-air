"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { fetchDatasets, fetchDatasetsPage, type DatasetItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

const DATASETS_PAGE_SIZE = 100;

/** Datasets list with cursor pagination when tenant/project scope is pinned. */
export function useDatasetsList(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const infiniteQuery = useInfiniteQuery({
    queryKey: mlairKeys.datasets.listInfinite(tenantId, projectId),
    queryFn: ({ pageParam }) =>
      fetchDatasetsPage(tenantId, projectId, token, {
        limit: DATASETS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    refetchOnMount: "always",
    ...poll,
  });

  const aggregateQuery = useQuery({
    queryKey: mlairKeys.datasets.list(tenantId, projectId),
    queryFn: () => fetchDatasets(tenantId, projectId, token),
    enabled: enabled && !scopePinned && Boolean(token?.trim()),
    refetchOnMount: "always",
    ...poll,
  });

  const query = scopePinned ? infiniteQuery : aggregateQuery;

  const items: DatasetItem[] = scopePinned
    ? (infiniteQuery.data?.pages.flatMap((p) => p.items) ?? [])
    : (aggregateQuery.data?.items ?? []);

  return {
    ...query,
    items,
    scopePinned,
    fetchNextPage: scopePinned ? infiniteQuery.fetchNextPage : undefined,
    hasNextPage: scopePinned ? infiniteQuery.hasNextPage : false,
    isFetchingNextPage: scopePinned ? infiniteQuery.isFetchingNextPage : false,
  };
}
