"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchActivityFeedPage } from "@/lib/api";
import type { ActivityScopeType } from "@/lib/activity-feed";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { isScopePinned } from "@/lib/scope";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const DEFAULT_PAGE_SIZE = 40;

/** Human-readable activity feed from Phase 3 projection store. */
export function useActivityFeedInfinite(
  scopeType: ActivityScopeType = "all",
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();
  const apiScope = scopeType === "all" ? undefined : scopeType;

  const query = useInfiniteQuery({
    queryKey: mlairKeys.projections.activityInfinite(tenantId, projectId, scopeType),
    queryFn: async ({ pageParam }) => {
      const page = await fetchActivityFeedPage(tenantId, projectId, token, {
        limit: pageSize,
        cursor: (pageParam as string | null) ?? undefined,
        scopeType: apiScope,
      });
      return {
        items: page.items,
        has_more: page.has_more,
        next_cursor: page.next_cursor,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    items,
    scopePinned,
    isLoading: query.isLoading && items.length === 0,
    isRefetching: query.isRefetching && items.length > 0,
    isError: query.isError,
    error: query.error,
    refresh: () => void query.refetch(),
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
