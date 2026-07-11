"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";

import { buildRunLogsWsUrl, type CursorPage, type LogItem } from "@/lib/api";

const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 30_000;

export type RunLogsLiveStatus = "off" | "connecting" | "live" | "polling";

export function isLogItem(value: unknown): value is LogItem {
  if (!value || typeof value !== "object") return false;
  const row = value as LogItem & { error?: string };
  if (row.error) return false;
  return typeof row.message === "string";
}

export function appendLiveLogToCache(
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
    if (
      page.items.some(
        (item) => `${item.ts}|${item.level}|${item.message}|${item.payload?.task_id ?? ""}` === key,
      )
    ) {
      return page;
    }
    return { ...page, items: [...page.items, entry] };
  });
  return { ...old, pages };
}

export function useRunLogsLiveStream(opts: {
  tenantId: string;
  projectId: string;
  runId: string;
  token: string;
  enabled: boolean;
  streamLive: boolean;
  queryKey: QueryKey;
  /** When set, only matching lines are appended from the run stream. */
  taskIdFilter?: string;
}) {
  const queryClient = useQueryClient();
  const {
    tenantId,
    projectId,
    runId,
    token,
    enabled,
    streamLive,
    queryKey,
    taskIdFilter,
  } = opts;

  const [liveStatus, setLiveStatus] = useState<RunLogsLiveStatus>(streamLive ? "connecting" : "off");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(BASE_BACKOFF_MS);
  const shouldHaltRef = useRef(false);

  useEffect(() => {
    shouldHaltRef.current = false;
    if (!enabled || !streamLive || !runId || !token?.trim()) {
      setLiveStatus("off");
      return () => {
        shouldHaltRef.current = true;
      };
    }

    const acceptEntry = (entry: LogItem) => {
      if (!taskIdFilter) return true;
      const tid = entry.payload?.task_id;
      return String(tid || "") === taskIdFilter;
    };

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
          if (!isLogItem(parsed) || !acceptEntry(parsed)) return;
          queryClient.setQueryData<InfiniteData<CursorPage<LogItem>>>(queryKey, (old) =>
            appendLiveLogToCache(old, parsed),
          );
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
    enabled,
    projectId,
    queryClient,
    queryKey,
    runId,
    streamLive,
    taskIdFilter,
    tenantId,
    token,
  ]);

  return liveStatus;
}
