"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildRunLogsWsUrl,
  fetchRunLogsPage,
  type CursorPage,
  type LogItem,
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling";

const RUN_LOGS_PAGE_SIZE = 200;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 30_000;

export type RunLogsLiveStatus = "off" | "connecting" | "live" | "polling";

function chronologicalLogItems(pages: Array<{ items: LogItem[] }> | undefined): LogItem[] {
  if (!pages?.length) return [];
  return [...pages].reverse().flatMap((p) => p.items);
}

function isLogItem(value: unknown): value is LogItem {
  if (!value || typeof value !== "object") return false;
  const row = value as LogItem & { error?: string };
  if (row.error) return false;
  return typeof row.message === "string";
}

function appendLiveLogToCache(
  old: InfiniteData<CursorPage<LogItem>> | undefined,
  entry: LogItem,
): InfiniteData<CursorPage<LogItem>> | undefined {
  if (!old?.pages?.length) return old;
  const pages = old.pages.map((page, index) => {
    if (index !== 0) return page;
    const seq = entry.sequence;
    if (seq != null && page.items.some((item) => item.sequence === seq)) {
      return page;
    }
    const key = `${entry.ts}|${entry.level}|${entry.message}|${entry.payload?.task_id ?? ""}`;
    if (page.items.some((item) => `${item.ts}|${item.level}|${item.message}|${item.payload?.task_id ?? ""}` === key)) {
      return page;
    }
    return { ...page, items: [...page.items, entry] };
  });
  return { ...old, pages };
}

export function useRunLogsInfinite(
  tenantId: string,
  projectId: string,
  runId: string,
  token: string,
  enabled: boolean,
  options?: {
    /** When true, subscribe to run log WebSocket instead of polling while the run is active. */
    streamLive?: boolean;
    refetchInterval?: number | false;
  },
) {
  const poll = useRealtimeQueryPolling();
  const queryClient = useQueryClient();
  const streamLive = Boolean(options?.streamLive);
  const [liveStatus, setLiveStatus] = useState<RunLogsLiveStatus>(streamLive ? "connecting" : "off");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(BASE_BACKOFF_MS);
  const shouldHaltRef = useRef(false);

  const pollInterval =
    streamLive && liveStatus === "live"
      ? false
      : options?.refetchInterval ?? poll.refetchInterval;

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
    refetchInterval: pollInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  });

  const appendLiveLog = useCallback(
    (entry: LogItem) => {
      queryClient.setQueryData<InfiniteData<CursorPage<LogItem>>>(
        mlairKeys.run.logsInfinite(runId),
        (old) => appendLiveLogToCache(old, entry),
      );
    },
    [queryClient, runId],
  );

  useEffect(() => {
    shouldHaltRef.current = false;
    if (!enabled || !streamLive || !runId || !token?.trim()) {
      setLiveStatus("off");
      return () => {
        shouldHaltRef.current = true;
      };
    }
    if (!query.isSuccess) {
      setLiveStatus("connecting");
      return () => {
        shouldHaltRef.current = true;
      };
    }

    const connect = () => {
      if (shouldHaltRef.current) return;
      setLiveStatus("connecting");
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      const ws = new WebSocket(buildRunLogsWsUrl(tenantId, projectId, runId, token));
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = BASE_BACKOFF_MS;
        setLiveStatus("live");
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data ?? "")) as unknown;
          if (!isLogItem(parsed)) return;
          appendLiveLog(parsed);
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        setLiveStatus("polling");
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (shouldHaltRef.current) return;
        setLiveStatus("polling");
        const delay = backoffRef.current;
        backoffRef.current = Math.min(MAX_BACKOFF_MS, delay * 1.6);
        reconnectTimer.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      shouldHaltRef.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      setLiveStatus("off");
    };
  }, [
    appendLiveLog,
    enabled,
    projectId,
    query.isSuccess,
    runId,
    streamLive,
    tenantId,
    token,
  ]);

  const items: LogItem[] = chronologicalLogItems(query.data?.pages);

  return {
    ...query,
    items,
    pageSize: RUN_LOGS_PAGE_SIZE,
    liveStatus,
  };
}
