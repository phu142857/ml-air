/**
 * When `NEXT_PUBLIC_MLAIR_REALTIME_WS` is unset, poll critical queries so the UI
 * stays fresh without a WebSocket (startUpForRTS.md §5.7).
 */
export function realtimeFallbackPolling():
  | { refetchInterval: number | false; refetchOnWindowFocus: boolean }
  | Record<string, never> {
  const ws = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MLAIR_REALTIME_WS?.trim() : "";
  if (ws) return {};
  return {
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  };
}
