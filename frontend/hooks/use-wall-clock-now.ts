"use client";

import { useEffect, useState } from "react";

/** Monotonic wall-clock ms, refreshed on an interval while enabled (live duration labels). */
export function useWallClockNow(enabled: boolean, intervalMs = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);

  return nowMs;
}
