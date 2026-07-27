"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type ExecutionLogStreamProps<T> = {
  items: T[];
  renderLine: (item: T, index: number) => ReactNode;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  isLoading: boolean;
  emptyMessage?: string;
  className?: string;
};

export function ExecutionLogStream<T>({
  items,
  renderLine,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  isLoading,
  emptyMessage = "No log lines yet.",
  className,
}: ExecutionLogStreamProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const initialScrolledRef = useRef(false);
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevTailCountRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 48;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (isLoadingOlder && !prependAnchorRef.current) {
      const el = containerRef.current;
      if (el) {
        prependAnchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      }
    }
  }, [isLoadingOlder]);

  useEffect(() => {
    if (!isLoadingOlder && prependAnchorRef.current) {
      const el = containerRef.current;
      const anchor = prependAnchorRef.current;
      prependAnchorRef.current = null;
      if (el) {
        const delta = el.scrollHeight - anchor.scrollHeight;
        el.scrollTop = anchor.scrollTop + delta;
      }
    }
  }, [isLoadingOlder, items.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isLoading) return;

    if (!initialScrolledRef.current && items.length > 0) {
      el.scrollTop = el.scrollHeight;
      initialScrolledRef.current = true;
      stickToBottomRef.current = true;
      prevTailCountRef.current = items.length;
      return;
    }

    if (items.length > prevTailCountRef.current && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevTailCountRef.current = items.length;
  }, [isLoading, items.length]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root || !hasMoreOlder) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreOlder && !isLoadingOlder) {
          onLoadOlder();
        }
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreOlder, isLoadingOlder, onLoadOlder, items.length]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "min-w-0 overflow-x-hidden overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed",
        className,
      )}
    >
      {hasMoreOlder ? (
        <div ref={topSentinelRef} className="flex min-h-6 justify-center py-2">
          {isLoadingOlder ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading older logs…
            </span>
          ) : null}
        </div>
      ) : null}
      {isLoading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading logs…
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">{emptyMessage}</p>
      ) : (
        items.map((item, index) => renderLine(item, index))
      )}
    </div>
  );
}
