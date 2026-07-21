"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchRunLogsPage, type LogItem, type LogSearchParams } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRunLogsLiveStream } from "@/lib/run-logs-live-stream";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const RUN_LOGS_PAGE_SIZE = 200;

function logSearchKey(search?: LogSearchParams): string {
  if (!search) return "";
  return [search.q ?? "", search.level ?? "", search.taskId ?? "", search.traceId ?? ""].join("|");
}

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
  options?: {
    streamLive?: boolean;
    refetchInterval?: number | false;
    search?: LogSearchParams;
  },
) {
  const poll = useRealtimeQueryPolling();
  const streamLive = Boolean(options?.streamLive);
  const search = options?.search;
  const searchKey = logSearchKey(search);
  const hasServerSearch = Boolean(search?.q || search?.level || search?.traceId || search?.taskId);

  const queryKey = useMemo(
    () => [...mlairKeys.run.logsInfinite(runId), searchKey] as const,
    [runId, searchKey],
  );

  const liveStatus = useRunLogsLiveStream({
    tenantId,
    projectId,
    runId,
    token,
    enabled,
    streamLive: streamLive && !hasServerSearch,
    queryKey,
  });

  const pollInterval =
    streamLive && (liveStatus === "live" || liveStatus === "connecting") && !hasServerSearch
      ? false
      : options?.refetchInterval ?? poll.refetchInterval;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchRunLogsPage(tenantId, projectId, runId, token, {
        limit: RUN_LOGS_PAGE_SIZE,
        cursor: (pageParam as string | null) ?? undefined,
        tail: pageParam == null,
        search,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor ? last.next_cursor : undefined,
    enabled: enabled && Boolean(runId && token?.trim()),
    refetchOnMount: "always",
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
    pageSize: RUN_LOGS_PAGE_SIZE,
    liveStatus: hasServerSearch ? ("off" as const) : liveStatus,
  };
}
