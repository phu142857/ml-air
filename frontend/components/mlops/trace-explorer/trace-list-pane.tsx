"use client";

import { useEffect, useRef } from "react";
import { Hash, Loader2 } from "lucide-react";

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
};

export function TraceListPane({
  items,
  selectedTraceId,
  onSelectTrace,
  search,
  onSearchChange,
  isLoading,
  searchInputRef,
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
      <div className="shrink-0 border-b border-border px-3 py-3">
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
          <p className="px-3 py-8 text-sm text-muted-foreground">No traces match your filter.</p>
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
                  <span className="truncate">{item.root_service || item.source || "—"}</span>
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
