"use client";

import { useEffect, useRef } from "react";

import {
  getMlairRealtimeUiStatus,
  subscribeMlairRealtimeUiStatus,
  type MlairRealtimeUiStatus,
} from "@/lib/mlair-realtime-status";
import { toastError, toastSuccess } from "@/lib/toast-actions";

function statusKey(status: MlairRealtimeUiStatus): string {
  if (status.kind === "fatal") return `fatal:${status.code}`;
  return status.kind;
}

/** Ambient toasts when realtime WebSocket falls back to polling or reconnects. */
export function useRealtimeStatusToasts(enabled = true) {
  const prevRef = useRef(statusKey(getMlairRealtimeUiStatus()));

  useEffect(() => {
    if (!enabled) return;

    const onChange = () => {
      const next = getMlairRealtimeUiStatus();
      const prevKey = prevRef.current;
      const nextKey = statusKey(next);
      if (prevKey === nextKey) return;
      prevRef.current = nextKey;

      if (next.kind === "polling" && (prevKey === "connected" || prevKey.startsWith("reconnecting"))) {
        toastError("Live updates paused", "Using polling fallback until the WebSocket reconnects.");
        return;
      }
      if (next.kind === "connected" && (prevKey === "polling" || prevKey.startsWith("reconnecting"))) {
        toastSuccess("Live updates restored", "WebSocket connection is active again.");
      }
    };

    const unsub = subscribeMlairRealtimeUiStatus(onChange);
    return unsub;
  }, [enabled]);
}
