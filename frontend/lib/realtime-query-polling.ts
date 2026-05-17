"use client";

import { useSyncExternalStore } from "react";

import { getRealtimeWsBase } from "./api";
import {
  getMlairRealtimeUiStatus,
  subscribeMlairRealtimeUiStatus,
  type MlairRealtimeUiStatus,
} from "./mlair-realtime-status";

const POLL_FAST_MS = 5_000;
const POLL_SAFE_MS = 12_000;

function subscribeStatus(cb: () => void) {
  return subscribeMlairRealtimeUiStatus(cb);
}

function getStatusSnapshot(): MlairRealtimeUiStatus {
  return getMlairRealtimeUiStatus();
}

/** Polling interval for React Query based on realtime transport health. */
export function realtimeQueryPollingOptions(
  status: MlairRealtimeUiStatus = getMlairRealtimeUiStatus(),
): { refetchInterval: number | false; refetchOnWindowFocus: boolean } {
  const wsConfigured = Boolean(getRealtimeWsBase()?.trim());
  if (!wsConfigured || status.kind === "polling" || status.kind === "reconnecting") {
    return { refetchInterval: POLL_FAST_MS, refetchOnWindowFocus: true };
  }
  if (status.kind === "connected") {
    return { refetchInterval: POLL_SAFE_MS, refetchOnWindowFocus: true };
  }
  if (status.kind === "connecting" || status.kind === "inactive") {
    return { refetchInterval: POLL_FAST_MS, refetchOnWindowFocus: true };
  }
  return { refetchInterval: POLL_FAST_MS, refetchOnWindowFocus: true };
}

export function useRealtimeQueryPolling() {
  const status = useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot);
  return realtimeQueryPollingOptions(status);
}

/** @deprecated Use {@link useRealtimeQueryPolling} — kept for gradual migration. */
export function realtimeFallbackPolling() {
  return realtimeQueryPollingOptions();
}
