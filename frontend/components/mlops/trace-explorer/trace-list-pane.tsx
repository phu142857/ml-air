"use client";

import { useEffect, useRef } from "react";
import { Hash, Loader2, PanelLeftClose } from "lucide-react";

import { Input } from "@/components/ui/input";
import { formatWaterfallDuration } from "@/components/mlops/trace-waterfall";
import type { TraceSearchHit } from "@/lib/api";
import { cn, formatDateTimeCompact } from "@/lib/utils";

export type TraceListPaneProps = {
  items: TraceSearchHit[];
  selectedTraceId: string | null;
  onSelectTrace: (traceId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onCollapse?: () => void;
  listEmptyAction?: React.ReactNode;
};

export function TraceListPane({
  items,
  selectedTraceId,
  onSelectTrace,
  search,
  onSearchChange,
  isLoading,
  searchInputRef,
  onCollapse,
  listEmptyAction,
}: TraceListPaneProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedTraceId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-trace-id="${CSS.escape(selectedTraceId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedTraceId]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Trace list</h2>
          {onCollapse ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-default hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={onCollapse}
              aria-label="Collapse trace list"
              title="Collapse trace list"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <label htmlFor="trace-list-search" className="sr-only">
          Filter traces
        </label>
        <Input
          id="trace-list-search"
          ref={searchInputRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter traces… (/)"
          className="h-8 font-mono text-xs"
          aria-keyshortcuts="/"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {items.length} trace{items.length === 1 ? "" : "s"}
        </p>
      </div>

      <div
        ref={listRef}
        className="scroll-region min-h-0 flex-1"
        role="listbox"
        aria-label="Trace list"
        aria-activedescendant={selectedTraceId ? `trace-option-${selectedTraceId}` : undefined}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading traces…
          </div>
        ) : items.length === 0 ? (
          listEmptyAction ?? (
            <p className="px-3 py-8 text-sm text-muted-foreground">No traces match your filter.</p>
          )
        ) : (
          items.map((item) => {
            const selected = item.trace_id === selectedTraceId;
            return (
              <button
                key={item.trace_id}
                type="button"
                id={`trace-option-${item.trace_id}`}
                data-trace-id={item.trace_id}
                role="option"
                aria-selected={selected}
                onClick={() => onSelectTrace(item.trace_id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left transition-default last:border-b-0",
                  selected
                    ? "border-l-2 border-l-primary bg-muted"
                    : "hover:bg-muted/60",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-foreground">
                  <Hash className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{item.trace_id}</span>
                </span>
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {[item.pipeline_id, item.run_id ? `run ${item.run_id}` : null, item.root_service || item.source]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {formatWaterfallDuration(item.duration_ms)}
                  </span>
                </span>
                {item.last_seen ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDateTimeCompact(item.last_seen)}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
