/** Re-export — use {@link useRealtimeQueryPolling} in client components when possible. */
export {
  isRealtimeWsPrimary,
  POLL_FALLBACK_MS,
  realtimeFallbackPolling,
  realtimeQueryPollingOptions,
  resolveActiveExecutionRefetchInterval,
  resolveRefetchInterval,
  useRealtimeQueryPolling,
} from "./realtime-query-polling";
