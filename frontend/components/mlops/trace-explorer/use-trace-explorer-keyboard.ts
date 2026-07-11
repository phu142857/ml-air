"use client";

import { useCallback, useEffect } from "react";

import type { TraceWaterfallStep } from "@/lib/api";

export type TraceExplorerKeyboardHandlers = {
  onFocusSearch: () => void;
  onMoveSelection: (delta: number) => void;
  onToggleExpand: () => void;
  onClearSelection: () => void;
  /** Return true when fullscreen was active and is now dismissed. */
  onExitFullscreen?: () => boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
};

export function useTraceExplorerKeyboard(
  enabled: boolean,
  handlers: TraceExplorerKeyboardHandlers,
) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }

      if (isTyping) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          handlers.onMoveSelection(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          handlers.onMoveSelection(-1);
          break;
        case "Enter":
          e.preventDefault();
          handlers.onToggleExpand();
          break;
        case "Escape":
          e.preventDefault();
          if (handlers.onExitFullscreen?.()) break;
          handlers.onClearSelection();
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
