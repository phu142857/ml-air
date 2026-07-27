"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchTaskLogsPage, type LogItem, type LogSearchParams } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRunLogsLiveStream } from "@/lib/run-logs-live-stream";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const TASK_LOGS_PAGE_SIZE = 200;

function logSearchKey(search?: LogSearchParams): string {
  if (!search) return "";
  return [search.q ?? "", search.level ?? "", search.traceId ?? ""].join("|");
}

function chronologicalLogItems(pages: Array<{ items: LogItem[] }> | undefined): LogItem[] {
  if (!pages?.length) return [];
  return [...pages].reverse().flatMap((p) => p.items);
}

export function useTaskLogsInfinite(
  tenantId: string,
  projectId: string,
  taskId: string,
  runId: string | undefined,
  token: string,
  enabled: boolean,
  options?: {
    streamLive?: boolean;
    refetchInterval?: number | false;
    search?: LogSearchParams;
  },
) {
  const poll = useRealtimeQueryPolling();
  const streamLive = Boolean(options?.streamLive && runId);
  const search = options?.search;
  const searchKey = logSearchKey(search);
  const hasServerSearch = Boolean(search?.q || search?.level || search?.traceId);

  const queryKey = useMemo(
    () => [...mlairKeys.task.logsInfinite(tenantId, projectId, taskId), searchKey] as const,
    [tenantId, projectId, taskId, searchKey],
  );

  const liveStatus = useRunLogsLiveStream({
    tenantId,
    projectId,
    runId: runId ?? "",
    token,
    enabled: enabled && Boolean(runId),
    streamLive: streamLive && !hasServerSearch,
    queryKey,
    taskIdFilter: taskId,
  });

  const pollInterval =
    streamLive && (liveStatus === "live" || liveStatus === "connecting") && !hasServerSearch
      ? false
      : options?.refetchInterval ?? poll.refetchInterval;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchTaskLogsPage(tenantId, projectId, taskId, token, {
        limit: TASK_LOGS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
        tail: pageParam == null,
        search,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(taskId && tenantId && projectId && token?.trim()),
    refetchInterval: pollInterval,
    refetchOnWindowFocus:
      streamLive && (liveStatus === "live" || liveStatus === "connecting") && !hasServerSearch
        ? false
        : poll.refetchOnWindowFocus,
    placeholderData: keepPreviousData,
  });

  const items: LogItem[] = chronologicalLogItems(query.data?.pages);

  return {
    ...query,
    items,
    pageSize: TASK_LOGS_PAGE_SIZE,
    liveStatus: hasServerSearch || !runId ? ("off" as const) : liveStatus,
  };
}
