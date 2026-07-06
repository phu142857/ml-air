"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchRunLogsPage, type LogItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const RUN_LOGS_PAGE_SIZE = 200;

function chronologicalLogItems(pages: Array<{ items: LogItem[] }> | undefined): LogItem[] {
  if (!pages?.length) return [];
  return [...pages].reverse().flatMap((p) => p.items);
}

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
        tail: pageParam == null,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(runId && token?.trim()),
    refetchOnMount: "always",
    refetchInterval: refetchInterval || poll.refetchInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const items: LogItem[] = chronologicalLogItems(query.data?.pages);

  return {
    ...query,
    items,
    pageSize: RUN_LOGS_PAGE_SIZE,
  };
}
