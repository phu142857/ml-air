"use client";

import { useSyncExternalStore } from "react";

import { getRealtimeWsBase } from "./api";
import {
  getMlairRealtimeUiStatus,
  subscribeMlairRealtimeUiStatus,
  type MlairRealtimeUiStatus,
} from "./mlair-realtime-status";

/** HTTP polling interval when WebSocket realtime is unavailable. */
export const POLL_FALLBACK_MS = 8_000;

/** Reconcile poll while WebSocket is connected (timeline, trace list, idle queries). */
export const POLL_RECONCILE_MS = 5_000;

/** Faster poll for active runs/tasks while WebSocket is connected. */
export const POLL_ACTIVE_EXECUTION_MS = 4_000;

export type RealtimeQueryPollingOptions = {
  refetchInterval: number | false;
  refetchOnWindowFocus: boolean;
};

function subscribeStatus(cb: () => void) {
  return subscribeMlairRealtimeUiStatus(cb);
}

function getStatusSnapshot(): MlairRealtimeUiStatus {
  return getMlairRealtimeUiStatus();
}

/** True when semantic realtime WebSocket is connected and should drive cache updates. */
export function isRealtimeWsPrimary(
  status: MlairRealtimeUiStatus = getMlairRealtimeUiStatus(),
): boolean {
  return Boolean(getRealtimeWsBase()?.trim()) && status.kind === "connected";
}

/**
 * React Query polling policy: WebSocket primary with a slow HTTP reconcile loop.
 * Fast polling for hot paths is opt-in via {@link resolveRefetchInterval}.
 */
export function realtimeQueryPollingOptions(
  status: MlairRealtimeUiStatus = getMlairRealtimeUiStatus(),
): RealtimeQueryPollingOptions {
  if (isRealtimeWsPrimary(status)) {
    return { refetchInterval: POLL_RECONCILE_MS, refetchOnWindowFocus: false };
  }
  return { refetchInterval: POLL_FALLBACK_MS, refetchOnWindowFocus: true };
}

/**
 * Pick refetch interval for a query. Active hot paths (usage, live trace) keep
 * their own interval even when WebSocket is connected.
 */
export function resolveRefetchInterval(
  poll: RealtimeQueryPollingOptions,
  opts?: { active?: boolean; activeMs?: number },
): number | false {
  if (opts?.active && opts.activeMs) return opts.activeMs;
  return poll.refetchInterval;
}

const ACTIVE_EXECUTION_STATUSES = new Set(["RUNNING", "PENDING", "QUEUED"]);

export function isActiveExecutionStatusValue(status: string | undefined): boolean {
  return ACTIVE_EXECUTION_STATUSES.has(String(status ?? "").toUpperCase());
}

export function resolveActiveExecutionRefetchInterval(
  poll: RealtimeQueryPollingOptions,
  status: string | undefined,
  activeMs: number = POLL_ACTIVE_EXECUTION_MS,
): number | false {
  return resolveRefetchInterval(poll, {
    active: isActiveExecutionStatusValue(status),
    activeMs,
  });
}

export function useRealtimeQueryPolling(): RealtimeQueryPollingOptions {
  const status = useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot);
  return realtimeQueryPollingOptions(status);
}

/** @deprecated Use {@link useRealtimeQueryPolling} — kept for gradual migration. */
export function realtimeFallbackPolling() {
  return realtimeQueryPollingOptions();
}
