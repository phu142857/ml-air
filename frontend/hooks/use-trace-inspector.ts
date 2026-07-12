"use client";

import { useCallback, useState } from "react";

const INSPECTOR_STORAGE_KEY = "mlair.trace.inspector";

function readInspectorPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(INSPECTOR_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return false;
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
  const [enabled, setEnabled] = useState(readInspectorPreference);
  const [lockedSpanId, setLockedSpanId] = useState<string | null>(null);

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
    toggleInspector,
    lockSpan,
    unlockSpan,
    resetInspector,
  };
}
