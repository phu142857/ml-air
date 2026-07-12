"use client";

import { useCallback, useEffect, useState } from "react";

const INSPECTOR_STORAGE_KEY = "mlair.trace.inspector";

function readInspectorPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(INSPECTOR_STORAGE_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

function writeInspectorPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(INSPECTOR_STORAGE_KEY, String(enabled));
  } catch {
    // ignore storage failures
  }
}

export function useTraceInspector() {
  // Start false on SSR + first client paint to avoid toolbar width flash,
  // then hydrate from localStorage after mount.
  const [enabled, setEnabled] = useState(false);
  const [lockedSpanId, setLockedSpanId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(readInspectorPreference());
    setHydrated(true);
  }, []);

  const toggleInspector = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      writeInspectorPreference(next);
      return next;
    });
    setLockedSpanId(null);
  }, []);

  const lockSpan = useCallback((spanId: string) => {
    setLockedSpanId(spanId);
  }, []);

  const unlockSpan = useCallback(() => {
    let unlocked = false;
    setLockedSpanId((prev) => {
      if (prev) unlocked = true;
      return null;
    });
    return unlocked;
  }, []);

  const resetInspector = useCallback(() => {
    setLockedSpanId(null);
  }, []);

  return {
    inspectorEnabled: enabled,
    inspectorLockedSpanId: lockedSpanId,
    inspectorHydrated: hydrated,
    toggleInspector,
    lockSpan,
    unlockSpan,
    resetInspector,
  };
}
