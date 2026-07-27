"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { fetchPipelines, fetchPipelinesPage, type PipelineItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

const PIPELINES_PAGE_SIZE = 100;

/** Pipelines list with cursor pagination when tenant/project scope is pinned. */
export function usePipelinesList(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const infiniteQuery = useInfiniteQuery({
    queryKey: mlairKeys.pipelines.listInfinite(tenantId, projectId),
    queryFn: ({ pageParam }) =>
      fetchPipelinesPage(tenantId, projectId, token, {
        limit: PIPELINES_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  const aggregateQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: enabled && !scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  const query = scopePinned ? infiniteQuery : aggregateQuery;

  const items: PipelineItem[] = scopePinned
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
