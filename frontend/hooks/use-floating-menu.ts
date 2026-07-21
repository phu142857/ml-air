"use client";

import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react";
import {
  computeFloatingMenuStyle,
  isFloatingMenuTarget,
} from "@/lib/floating-menu";

type Options = {
  anchorRef: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  open: boolean;
  setOpen: (next: boolean) => void;
  maxHeight?: number;
};

/**
 * Sync portaled menu position on open, scroll, and resize; dismiss on outside click / Escape.
 */
export function useFloatingMenu({
  anchorRef,
  rootRef,
  open,
  setOpen,
  maxHeight,
}: Options) {
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const syncMenuPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setMenuStyle(computeFloatingMenuStyle(anchor.getBoundingClientRect(), { maxHeight }));
  }, [anchorRef, maxHeight]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    syncMenuPosition();
    const onScrollOrResize = () => syncMenuPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, syncMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      const target = e.target;
      if (root?.contains(target as Node)) return;
      if (isFloatingMenuTarget(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef, setOpen]);

  return { mounted, menuStyle, syncMenuPosition };
}
