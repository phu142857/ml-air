"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchRunLogsPage, type LogItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const RUN_LOGS_PAGE_SIZE = 200;

export function useRunLogsInfinite(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
  enabled: boolean,
  refetchInterval: number | false = false
) {
  const poll = useRealtimeQueryPolling();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.run.logsInfinite(runId),
    queryFn: ({ pageParam }) =>
      fetchRunLogsPage(tenantId, projectId, runId, token, {
        limit: RUN_LOGS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(runId && token?.trim()),
    refetchOnMount: "always",
    refetchInterval: refetchInterval || poll.refetchInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const items: LogItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    pageSize: RUN_LOGS_PAGE_SIZE,
  };
}
