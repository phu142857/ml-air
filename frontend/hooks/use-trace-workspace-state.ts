"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const TRACE_WORKSPACE_DEFAULT_LEFT = 22;
export const TRACE_WORKSPACE_DEFAULT_RIGHT = 25;
export const TRACE_WORKSPACE_DEFAULT_CENTER = 53;
export const TRACE_WORKSPACE_COLLAPSED_SIZE = 3;
export const TRACE_WORKSPACE_RESIZE_DEBOUNCE_MS = 150;

const KEY_LEFT_WIDTH = "mlair.trace.left.width";
const KEY_RIGHT_WIDTH = "mlair.trace.right.width";
const KEY_LEFT_COLLAPSED = "mlair.trace.left.collapsed";
const KEY_RIGHT_COLLAPSED = "mlair.trace.right.collapsed";

export type TraceWorkspacePersistedLayout = {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

export type TraceWorkspaceState = TraceWorkspacePersistedLayout & {
  waterfallFullscreen: boolean;
};

type TraceWorkspaceStorageKeys = {
  leftWidth: string;
  rightWidth: string;
  leftCollapsed: string;
  rightCollapsed: string;
};

function scopeSuffix(tenantId: string, projectId: string): string {
  if (tenantId === "all" || projectId === "all") return "";
  return `.${tenantId}.${projectId}`;
}

export function getTraceWorkspaceStorageKeys(
  tenantId: string,
  projectId: string,
): TraceWorkspaceStorageKeys {
  const suffix = scopeSuffix(tenantId, projectId);
  return {
    leftWidth: `${KEY_LEFT_WIDTH}${suffix}`,
    rightWidth: `${KEY_RIGHT_WIDTH}${suffix}`,
    leftCollapsed: `${KEY_LEFT_COLLAPSED}${suffix}`,
    rightCollapsed: `${KEY_RIGHT_COLLAPSED}${suffix}`,
  };
}

function clampWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readBoolean(key: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

function readNumber(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore storage failures
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore storage failures
  }
}

function removeKeys(keys: TraceWorkspaceStorageKeys) {
  try {
    Object.values(keys).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore storage failures
  }
}

export function readTraceWorkspaceLayout(
  tenantId: string,
  projectId: string,
): TraceWorkspacePersistedLayout {
  const keys = getTraceWorkspaceStorageKeys(tenantId, projectId);
  const leftWidth = clampWidth(
    readNumber(keys.leftWidth) ?? TRACE_WORKSPACE_DEFAULT_LEFT,
    16,
    35,
  );
  const rightWidth = clampWidth(
    readNumber(keys.rightWidth) ?? TRACE_WORKSPACE_DEFAULT_RIGHT,
    18,
    40,
  );
  return {
    leftWidth,
    rightWidth,
    leftCollapsed: readBoolean(keys.leftCollapsed) ?? false,
    rightCollapsed: readBoolean(keys.rightCollapsed) ?? false,
  };
}

export type UseTraceWorkspaceStateOptions = {
  tenantId: string;
  projectId: string;
};

export function useTraceWorkspaceState({
  tenantId,
  projectId,
}: UseTraceWorkspaceStateOptions) {
  const storageKeys = useMemo(
    () => getTraceWorkspaceStorageKeys(tenantId, projectId),
    [tenantId, projectId],
  );

  const [layout, setLayout] = useState<TraceWorkspacePersistedLayout>(() =>
    typeof window === "undefined"
      ? {
          leftWidth: TRACE_WORKSPACE_DEFAULT_LEFT,
          rightWidth: TRACE_WORKSPACE_DEFAULT_RIGHT,
          leftCollapsed: false,
          rightCollapsed: false,
        }
      : readTraceWorkspaceLayout(tenantId, projectId),
  );
  const [waterfallFullscreen, setWaterfallFullscreen] = useState(false);

  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    setLayout(readTraceWorkspaceLayout(tenantId, projectId));
    setWaterfallFullscreen(false);
  }, [tenantId, projectId]);

  useEffect(
    () => () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    },
    [],
  );

  const persistDebouncedWidths = useCallback(
    (leftWidth: number, rightWidth: number) => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        const current = layoutRef.current;
        const next = {
          ...current,
          leftWidth: clampWidth(leftWidth, 16, 35),
          rightWidth: clampWidth(rightWidth, 18, 40),
        };
        layoutRef.current = next;
        setLayout(next);
        writeNumber(storageKeys.leftWidth, next.leftWidth);
        writeNumber(storageKeys.rightWidth, next.rightWidth);
      }, TRACE_WORKSPACE_RESIZE_DEBOUNCE_MS);
    },
    [storageKeys.leftWidth, storageKeys.rightWidth],
  );

  const handlePanelLayout = useCallback(
    (sizes: number[]) => {
      const left = sizes[0];
      const right = sizes[2];
      if (left == null || right == null) return;
      const current = layoutRef.current;
      const leftWidth =
        current.leftCollapsed || left <= TRACE_WORKSPACE_COLLAPSED_SIZE + 1
          ? current.leftWidth
          : left;
      const rightWidth =
        current.rightCollapsed || right <= TRACE_WORKSPACE_COLLAPSED_SIZE + 1
          ? current.rightWidth
          : right;
      if (
        leftWidth === current.leftWidth &&
        rightWidth === current.rightWidth
      ) {
        return;
      }
      persistDebouncedWidths(leftWidth, rightWidth);
    },
    [persistDebouncedWidths],
  );

  const setLeftCollapsed = useCallback(
    (collapsed: boolean) => {
      setLayout((prev) => {
        const next = { ...prev, leftCollapsed: collapsed };
        layoutRef.current = next;
        writeBoolean(storageKeys.leftCollapsed, collapsed);
        return next;
      });
    },
    [storageKeys.leftCollapsed],
  );

  const setRightCollapsed = useCallback(
    (collapsed: boolean) => {
      setLayout((prev) => {
        const next = { ...prev, rightCollapsed: collapsed };
        layoutRef.current = next;
        writeBoolean(storageKeys.rightCollapsed, collapsed);
        return next;
      });
    },
    [storageKeys.rightCollapsed],
  );

  const toggleLeftCollapsed = useCallback(() => {
    setLeftCollapsed(!layoutRef.current.leftCollapsed);
  }, [setLeftCollapsed]);

  const toggleRightCollapsed = useCallback(() => {
    setRightCollapsed(!layoutRef.current.rightCollapsed);
  }, [setRightCollapsed]);

  const resetLayout = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    const next: TraceWorkspacePersistedLayout = {
      leftWidth: TRACE_WORKSPACE_DEFAULT_LEFT,
      rightWidth: TRACE_WORKSPACE_DEFAULT_RIGHT,
      leftCollapsed: false,
      rightCollapsed: false,
    };
    layoutRef.current = next;
    setLayout(next);
    removeKeys(storageKeys);
  }, [storageKeys]);

  const centerWidth = useMemo(
    () =>
      Math.max(
        35,
        100 -
          (layout.leftCollapsed
            ? TRACE_WORKSPACE_COLLAPSED_SIZE
            : layout.leftWidth) -
          (layout.rightCollapsed
            ? TRACE_WORKSPACE_COLLAPSED_SIZE
            : layout.rightWidth),
      ),
    [layout],
  );

  const defaultPanelSizes = useMemo(
    () => ({
      left: layout.leftCollapsed
        ? TRACE_WORKSPACE_COLLAPSED_SIZE
        : layout.leftWidth,
      center: centerWidth,
      right: layout.rightCollapsed
        ? TRACE_WORKSPACE_COLLAPSED_SIZE
        : layout.rightWidth,
    }),
    [centerWidth, layout],
  );

  const exitFullscreen = useCallback(() => {
    let exited = false;
    setWaterfallFullscreen((prev) => {
      if (prev) exited = true;
      return false;
    });
    return exited;
  }, []);

  return {
    leftWidth: layout.leftWidth,
    rightWidth: layout.rightWidth,
    leftCollapsed: layout.leftCollapsed,
    rightCollapsed: layout.rightCollapsed,
    waterfallFullscreen,
    centerWidth,
    defaultPanelSizes,
    setWaterfallFullscreen,
    exitFullscreen,
    toggleLeftCollapsed,
    toggleRightCollapsed,
    setLeftCollapsed,
    setRightCollapsed,
    handlePanelLayout,
    resetLayout,
  };
}
