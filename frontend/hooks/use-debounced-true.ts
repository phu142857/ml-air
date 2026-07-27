"use client";

import { useEffect, useState } from "react";

/** Delay showing transient true flags (e.g. background refetch) to reduce UI flicker. */
export function useDebouncedTrue(value: boolean, delayMs = 700): boolean {
  const [debounced, setDebounced] = useState(false);

  useEffect(() => {
    if (!value) {
      setDebounced(false);
      return;
    }
    const timer = window.setTimeout(() => setDebounced(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
