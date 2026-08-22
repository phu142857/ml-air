"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchExperimentsPage, type ExperimentItem } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";
import { isScopePinned } from "@/lib/scope";

const EXPERIMENTS_PAGE_SIZE = 50;

export function useExperimentsList(enabled = true) {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const poll = useRealtimeQueryPolling();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.experiments.listInfinite(tenantId, projectId),
    queryFn: ({ pageParam }) =>
      fetchExperimentsPage(tenantId, projectId, token, {
        limit: EXPERIMENTS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && scopePinned && Boolean(token?.trim()),
    ...poll,
  });

  const items: ExperimentItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    scopePinned,
    pageSize: EXPERIMENTS_PAGE_SIZE,
  };
}
