"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchTaskLogsPage, type LogItem } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const TASK_LOGS_PAGE_SIZE = 200;

export function useTaskLogsInfinite(
  tenantId: string,
  projectId: string,
  taskId: string,
  token: string,
  enabled: boolean,
  refetchInterval: number | false = false
) {
  const poll = useRealtimeQueryPolling();

  const query = useInfiniteQuery({
    queryKey: mlairKeys.task.logsInfinite(tenantId, projectId, taskId),
    queryFn: ({ pageParam }) =>
      fetchTaskLogsPage(tenantId, projectId, taskId, token, {
        limit: TASK_LOGS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(taskId && tenantId && projectId && token?.trim()),
    refetchOnMount: "always",
    refetchInterval: refetchInterval || poll.refetchInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const items: LogItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    pageSize: TASK_LOGS_PAGE_SIZE,
  };
}
