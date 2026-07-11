"use client";

import { useCallback, useEffect } from "react";

import type { TraceWaterfallStep } from "@/lib/api";

export type TraceFocusRegion = "trace-list" | "waterfall" | "detail" | "toolbar";

export type TraceExplorerKeyboardHandlers = {
  onFocusSearch: () => void;
  onMoveSelection: (delta: number) => void;
  /** Focus detail panel on Enter (Sprint 1.2). */
  onFocusDetailPanel: () => void;
  onClearSelection: () => void;
  /** Return true when fullscreen was active and is now dismissed. */
  onExitFullscreen?: () => boolean;
  /** Return true when span filter was cleared. */
  onClearSpanFilter?: () => boolean;
  /** Return true when trace list search was cleared. */
  onClearTraceSearch?: () => boolean;
  onCollapseSubtree?: () => void;
  onExpandSubtree?: () => void;
  onCopyId?: () => void;
  onCycleFocusRegion?: (direction: 1 | -1) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  /** When true, arrow keys move span selection; when false, skip tree/selection keys. */
  isWaterfallFocused?: () => boolean;
};

function hasTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const selection = window.getSelection()?.toString() ?? "";
  return selection.trim().length > 0;
}

function isTypingTarget(target: HTMLElement | null): boolean {
  const tag = target?.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    Boolean(target?.isContentEditable)
  );
}

export function useTraceExplorerKeyboard(
  enabled: boolean,
  handlers: TraceExplorerKeyboardHandlers,
) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = isTypingTarget(target);

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }

      if (e.key === "Escape") {
        if (isTyping) {
          if (target?.id === "span-filter" && handlers.onClearSpanFilter?.()) {
            e.preventDefault();
          } else if (target?.id === "trace-list-search" && handlers.onClearTraceSearch?.()) {
            e.preventDefault();
          }
          return;
        }

        e.preventDefault();
        if (handlers.onExitFullscreen?.()) return;
        if (handlers.onClearSpanFilter?.()) return;
        if (handlers.onClearTraceSearch?.()) return;
        handlers.onClearSelection();
        return;
      }

      if (isTyping) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (hasTextSelection()) return;
        e.preventDefault();
        handlers.onCopyId?.();
        return;
      }

      if (e.key === "Tab" && handlers.onCycleFocusRegion) {
        e.preventDefault();
        handlers.onCycleFocusRegion(e.shiftKey ? -1 : 1);
        return;
      }

      const waterfallFocused = handlers.isWaterfallFocused?.() ?? true;

      switch (e.key) {
        case "ArrowDown":
          if (!waterfallFocused) return;
          e.preventDefault();
          handlers.onMoveSelection(1);
          break;
        case "ArrowUp":
          if (!waterfallFocused) return;
          e.preventDefault();
          handlers.onMoveSelection(-1);
          break;
        case "ArrowLeft":
          if (!waterfallFocused) return;
          e.preventDefault();
          handlers.onCollapseSubtree?.();
          break;
        case "ArrowRight":
          if (!waterfallFocused) return;
          e.preventDefault();
          handlers.onExpandSubtree?.();
          break;
        case "Enter":
          if (!waterfallFocused) return;
          e.preventDefault();
          handlers.onFocusDetailPanel();
          break;
        case "+":
        case "=":
          if (e.shiftKey || e.key === "+") {
            e.preventDefault();
            handlers.onZoomIn?.();
          }
          break;
        case "-":
          e.preventDefault();
          handlers.onZoomOut?.();
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handlers.onResetZoom?.();
          }
          break;
        default:
          break;
      }
    },
    [handlers],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onKeyDown]);
}

export function findStepByFlatIndex(
  steps: TraceWaterfallStep[],
  index: number,
): TraceWaterfallStep | null {
  if (index < 0 || index >= steps.length) return null;
  return steps[index] ?? null;
}
