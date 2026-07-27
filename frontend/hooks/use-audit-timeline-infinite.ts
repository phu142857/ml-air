"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { fetchAuditTimeline, fetchAuditTimelinePage } from "@/lib/api";
import { mapAuditTimelineItems, type AuditEvent } from "@/lib/audit-event";
import type { AuditTimelineFilters } from "@/lib/audit-timeline-filters";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { isScopePinned } from "@/lib/scope";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const DEFAULT_PAGE_SIZE = 50;

/** Filtered audit timeline with cursor pagination when scope is pinned. */
export function useAuditTimelineInfinite(
  filters: AuditTimelineFilters,
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
  refetchInterval?: number | false,
) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();
  const interval = refetchInterval ?? poll.refetchInterval;

  const infiniteQuery = useInfiniteQuery({
    queryKey: mlairKeys.audit.timelineFilteredInfinite(tenantId, projectId, filters),
    queryFn: async ({ pageParam }) => {
      const page = await fetchAuditTimelinePage(tenantId, projectId, token, {
        limit: pageSize,
        cursor: (pageParam as string | null) ?? undefined,
        filters,
      });
      return {
        events: mapAuditTimelineItems(page.items),
        has_more: page.has_more,
        next_cursor: page.next_cursor,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    refetchInterval: interval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const aggregateQuery = useQuery({
    queryKey: mlairKeys.audit.timeline(tenantId, projectId, filters),
    queryFn: async () => {
      const { items } = await fetchAuditTimeline(tenantId, projectId, token, {
        limit: pageSize,
        filters,
      });
      return { events: mapAuditTimelineItems(items) };
    },
    enabled: enabled && !scopePinned && Boolean(token?.trim()),
    refetchInterval: interval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const query = scopePinned ? infiniteQuery : aggregateQuery;

  const events: AuditEvent[] = scopePinned
    ? (infiniteQuery.data?.pages.flatMap((p) => p.events) ?? [])
    : (aggregateQuery.data?.events ?? []);

  return {
    ...query,
    events,
    scopePinned,
    fetchNextPage: scopePinned ? infiniteQuery.fetchNextPage : undefined,
    hasNextPage: scopePinned ? infiniteQuery.hasNextPage : false,
    isFetchingNextPage: scopePinned ? infiniteQuery.isFetchingNextPage : false,
  };
}
