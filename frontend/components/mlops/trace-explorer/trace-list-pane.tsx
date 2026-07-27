"use client";

import { useEffect, useRef } from "react";
import { Loader2, PanelLeftClose, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useWallClockNow } from "@/hooks/use-wall-clock-now";
import { computeTraceSearchDurationMs } from "@/lib/trace-duration";
import { formatDurationMs } from "@/lib/usage-format";
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
  /** When set, that trace duration ticks live (matches trace detail is_live). */
  liveTraceId?: string | null;
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
  liveTraceId = null,
}: TraceListPaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const wallClockNowMs = useWallClockNow(Boolean(liveTraceId));

  useEffect(() => {
    if (!selectedTraceId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-trace-id="${CSS.escape(selectedTraceId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedTraceId]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card/50" data-trace-region="trace-list">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Trace list</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {items.length} trace{items.length === 1 ? "" : "s"}
            </span>
            {onCollapse ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-default hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={onCollapse}
                aria-label="Collapse trace list"
                title="Collapse trace list"
              >
                <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        <label htmlFor="trace-list-search" className="sr-only">
          Filter traces
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="trace-list-search"
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter traces… (/)"
            className="h-8 border-border/70 bg-background pl-8 font-mono text-xs"
            aria-keyshortcuts="/"
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="scroll-region min-h-0 flex-1 px-2 py-2"
        role="listbox"
        aria-label="Traces"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading traces…
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground">
            {listEmptyAction ?? "No traces match."}
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => {
              const selected = item.trace_id === selectedTraceId;
              const isLive = Boolean(liveTraceId && item.trace_id === liveTraceId);
              const durationMs = computeTraceSearchDurationMs(item, {
                nowMs: wallClockNowMs,
                isLive,
              });
              const subtitle =
                [item.pipeline_id, item.run_id ? `run ${item.run_id}` : null, item.root_service || item.source]
                  .filter(Boolean)
                  .join(" · ") || "—";

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
                    "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-default",
                    selected
                      ? "border-primary/30 bg-primary/10 hover:border-primary/50"
                      : "border-transparent hover:border-border hover:bg-muted/40",
                  )}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate font-mono text-xs font-medium",
                        selected ? "text-primary" : "text-foreground",
                      )}
                    >
                      # {item.trace_id.slice(0, 12)}…
                    </span>
                    {isLive ? (
                      <span
                        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[color:var(--status-success-fg)]"
                        aria-label="Live trace"
                        title="Live trace"
                      />
                    ) : (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatDurationMs(durationMs)}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
                  {item.last_seen ? (
                    <span className="font-mono text-[10px] text-muted-foreground/80">
                      {formatDateTimeCompact(item.last_seen)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
