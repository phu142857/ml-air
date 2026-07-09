"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Route } from "lucide-react";

import { TraceExplorerShell } from "@/components/mlops/trace-explorer/trace-explorer-shell";
import { ScopePinnedInline } from "@/components/mlops/layout";
import { ScopedListContent } from "@/components/mlops/scoped-list-content";
import { useAppContext } from "@/lib/app-context";
import { fetchTraceList } from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { SCOPE_AGGREGATE_RUNS } from "@/lib/scope-messages";
import { isScopePinned } from "@/lib/scope";
import { formatApiClientError } from "@/lib/utils";

export default function TracesPage() {
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);
  const isAggregate = !scopePinned;
  const [search, setSearch] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: mlairKeys.trace.list(tenantId, projectId, 0),
    queryFn: () => fetchTraceList(tenantId, projectId, token, { limit: 50 }),
    enabled: scopePinned && Boolean(token?.trim()),
    staleTime: 10_000,
  });

  const items = listQuery.data?.items ?? [];
  const filtered = useMemo(
    () =>
      search.trim()
        ? items.filter((item) =>
            item.trace_id.toLowerCase().includes(search.trim().toLowerCase()),
          )
        : items,
    [items, search],
  );

  useEffect(() => {
    if (!selectedTraceId && filtered.length > 0) {
      setSelectedTraceId(filtered[0].trace_id);
    }
  }, [filtered, selectedTraceId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-primary/10">
            <Route className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              Trace viewer
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAggregate
                ? "Pin tenant and project to browse traces"
                : "Distributed execution timeline · keyboard-first"}
            </p>
          </div>
        </div>
      </header>

      {isAggregate ? (
        <div className="shrink-0 px-4 py-3 sm:px-6">
          <ScopePinnedInline message={SCOPE_AGGREGATE_RUNS} />
        </div>
      ) : null}

      {scopePinned ? (
        <ScopedListContent
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          errorMessage={listQuery.error ? formatApiClientError(listQuery.error) : undefined}
          isEmpty={false}
          emptyIcon={Route}
          emptyTitle=""
          emptyDescription=""
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TraceExplorerShell
              traceList={filtered}
              selectedTraceId={selectedTraceId}
              onSelectTrace={setSelectedTraceId}
              traceSearch={search}
              onTraceSearchChange={setSearch}
              listLoading={listQuery.isLoading}
            />
          </div>
        </ScopedListContent>
      ) : (
        <p className="px-6 py-8 text-sm text-muted-foreground">
          Pin a tenant and project in the header to open the trace viewer.
        </p>
      )}
    </div>
  );
}
