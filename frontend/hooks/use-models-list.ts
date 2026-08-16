"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { fetchModels, fetchModelsPage, type ModelItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

const MODELS_PAGE_SIZE = 100;

/** Models list with cursor pagination when tenant/project scope is pinned. */
export function useModelsList(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const infiniteQuery = useInfiniteQuery({
    queryKey: mlairKeys.models.listInfinite(tenantId, projectId),
    queryFn: ({ pageParam }) =>
      fetchModelsPage(tenantId, projectId, token, {
        limit: MODELS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  const aggregateQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    enabled: enabled && !scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  const query = scopePinned ? infiniteQuery : aggregateQuery;

  const items: ModelItem[] = scopePinned
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
