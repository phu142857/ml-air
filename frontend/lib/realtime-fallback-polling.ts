/**
 * When `NEXT_PUBLIC_MLAIR_REALTIME_WS` is unset, poll critical queries so the UI
 * stays fresh without a WebSocket (see startUpForRTS.md §5.7).
 */
export function realtimeFallbackPolling(): { refetchInterval: number } | Record<string, never> {
  const ws = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS?.trim() : "";
  if (ws) return {};
  return { refetchInterval: 5000 };
}
