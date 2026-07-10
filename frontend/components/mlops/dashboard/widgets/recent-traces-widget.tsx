"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Route } from "lucide-react"

import { TraceLink } from "@/components/mlops/trace-link"
import { MlopsEmptyState } from "@/components/mlops/layout"
import { fetchTraceList } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { formatApiClientError } from "@/lib/utils"

type RecentTracesWidgetProps = {
  tenantId: string
  projectId: string
  token: string
  scopePinned: boolean
}

export function RecentTracesWidget({
  tenantId,
  projectId,
  token,
  scopePinned,
}: RecentTracesWidgetProps) {
  const tracesQ = useQuery({
    queryKey: mlairKeys.trace.list(tenantId, projectId, 0),
    queryFn: () => fetchTraceList(tenantId, projectId, token, { limit: 8 }),
    enabled: scopePinned && Boolean(token?.trim()),
    staleTime: 10_000,
  })

  if (!scopePinned) {
    return (
      <MlopsEmptyState
        icon={Route}
        title="Pin scope for traces"
        description="Pin tenant and project to load recent traces."
        className="border-0 bg-transparent p-0"
      />
    )
  }

  if (tracesQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading traces…
      </div>
    )
  }

  if (tracesQ.isError) {
    return (
      <p className="text-sm text-[color:var(--status-failed-fg)]">
        {formatApiClientError(tracesQ.error)}
      </p>
    )
  }

  const items = tracesQ.data?.items ?? []
  if (items.length === 0) {
    return (
      <MlopsEmptyState
        icon={Route}
        title="No traces yet"
        description="Distributed traces from runs will appear here."
        className="border-0 bg-transparent p-0"
      />
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {items.map((trace) => (
          <li
            key={trace.trace_id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
          >
            <div className="min-w-0">
              <TraceLink
                traceId={trace.trace_id}
                className="truncate font-mono text-xs text-primary hover:text-primary/80"
              />
              <div className="truncate text-[10px] text-muted-foreground">
                {trace.root_service || trace.root_name || trace.source}
              </div>
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {trace.duration_ms != null ? `${Math.round(trace.duration_ms)}ms` : "—"}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/traces" className="text-[10px] text-primary hover:text-primary/80">
        Open trace viewer →
      </Link>
    </div>
  )
}
