"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, Loader2, Route } from "lucide-react";

import { TraceExplorerDialog } from "@/components/mlops/trace-link";
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { ScopedListContent } from "@/components/mlops/scoped-list-content";
import { Input } from "@/components/ui/input";
import { formatWaterfallDuration } from "@/components/mlops/trace-waterfall";
import { useAppContext } from "@/lib/app-context";
import { fetchTraceList } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { SCOPE_AGGREGATE_RUNS } from "@/lib/scope-messages";
import { isScopePinned } from "@/lib/scope";
import { cn, formatApiClientError, formatDateTimeCompact } from "@/lib/utils";

export default function TracesPage() {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const isAggregate = !scopePinned;
  const [search, setSearch] = useState("");
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: mlairKeys.trace.list(tenantId, projectId, 0),
    queryFn: () => fetchTraceList(tenantId, projectId, token, { limit: 50 }),
    enabled: scopePinned && Boolean(token?.trim()),
    staleTime: 10_000,
  });

  const items = listQuery.data?.items ?? [];
  const filtered = search.trim()
    ? items.filter((item) => item.trace_id.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Route}
        accent="sky"
        title="Traces"
        subtitle={
          isAggregate
            ? "Pin tenant and project to browse traces"
            : `${filtered.length} traces · distributed execution timeline`
        }
      />

      <PageScrollBody header={isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_RUNS} /> : null}>
        {scopePinned ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by trace ID…"
              className="h-9 max-w-md font-mono text-xs"
            />
          </div>
        ) : null}

        <ScopedListContent
          isLoading={scopePinned && listQuery.isLoading}
          isError={scopePinned && listQuery.isError}
          errorMessage={listQuery.error ? formatApiClientError(listQuery.error) : undefined}
          isEmpty={scopePinned && filtered.length === 0}
          emptyIcon={Route}
          emptyTitle="No traces in this scope"
          emptyDescription="Run a pipeline to generate trace IDs and OTLP spans."
        >
          {scopePinned ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1fr_140px_120px_100px] border-b border-border bg-muted/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Trace</span>
                <span>Service</span>
                <span>Last seen</span>
                <span className="text-right">Duration</span>
              </div>
              {filtered.map((item) => (
                <button
                  key={item.trace_id}
                  type="button"
                  onClick={() => setOpenTraceId(item.trace_id)}
                  className={cn(
                    "grid w-full grid-cols-[1fr_140px_120px_100px] items-center gap-2 border-b border-border/60 px-3 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/30",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 font-mono text-xs">
                    <Hash className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{item.trace_id}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{item.root_service || item.source}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.last_seen ? formatDateTimeCompact(item.last_seen) : "—"}
                  </span>
                  <span className="text-right font-mono text-[11px] tabular-nums text-foreground">
                    {formatWaterfallDuration(item.duration_ms)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </ScopedListContent>
      </PageScrollBody>

      {openTraceId ? (
        <TraceExplorerDialog
          traceId={openTraceId}
          open={Boolean(openTraceId)}
          onOpenChange={(open) => {
            if (!open) setOpenTraceId(null);
          }}
        />
      ) : null}
    </div>
  );
}
