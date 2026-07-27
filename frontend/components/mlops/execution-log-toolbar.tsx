"use client";

import { Download, Loader2, Search } from "lucide-react";
import { useCallback, useState } from "react";

import { useDebouncedTrue } from "@/hooks/use-debounced-true";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LogSearchParams } from "@/lib/api";
import type { RunLogsLiveStatus } from "@/lib/run-logs-live-stream";

export type ExecutionLogToolbarProps = {
  search: LogSearchParams;
  onSearchChange: (next: LogSearchParams) => void;
  liveStatus?: RunLogsLiveStatus;
  isFetching?: boolean;
  onExport?: () => void | Promise<void>;
  exporting?: boolean;
  extra?: React.ReactNode;
};

const LOG_LEVELS = ["all", "DEBUG", "INFO", "WARN", "ERROR"] as const;

export function ExecutionLogToolbar({
  search,
  onSearchChange,
  liveStatus = "off",
  isFetching = false,
  onExport,
  exporting = false,
  extra,
}: ExecutionLogToolbarProps) {
  const [draftQ, setDraftQ] = useState(search.q ?? "");
  const showRefreshing = useDebouncedTrue(
    isFetching && liveStatus !== "live" && liveStatus !== "connecting",
    800,
  );

  const applySearch = useCallback(() => {
    onSearchChange({ ...search, q: draftQ.trim() || undefined });
  }, [draftQ, onSearchChange, search]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/80 px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-[min(220px,55vw)] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            placeholder="Search message…"
            className="h-8 pl-8 font-mono text-xs"
          />
        </div>
        <Select
          value={search.level ?? "all"}
          onValueChange={(level) =>
            onSearchChange({ ...search, level: level === "all" ? undefined : level })
          }
        >
          <SelectTrigger className="h-8 w-[7.5rem] text-xs">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            {LOG_LEVELS.map((level) => (
              <SelectItem key={level} value={level} className="text-xs">
                {level === "all" ? "All levels" : level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={applySearch}>
          Search
        </Button>
        {extra}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {liveStatus === "live" ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Live
          </span>
        ) : liveStatus === "connecting" ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting
          </span>
        ) : showRefreshing ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing
          </span>
        ) : null}
        {onExport ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={exporting}
            onClick={() => void onExport()}
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Export
          </Button>
        ) : null}
      </div>
    </div>
  );
}
