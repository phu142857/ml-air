"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { WidgetSkeleton } from "@/components/mlops/interaction"
import { Route } from "lucide-react"

import { formatWaterfallDuration } from "@/components/mlops/trace-waterfall"
import { TraceLink } from "@/components/mlops/trace-link"
import { MlopsEmptyState } from "@/components/mlops/layout"
import type { TraceSearchHit } from "@/lib/api"
import { fetchTraceList } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { formatApiClientError } from "@/lib/utils"

type RecentTracesWidgetProps = {
  tenantId: string
  projectId: string
  token: string
  scopePinned: boolean
}

function traceTitle(trace: TraceSearchHit): string {
  const rootName = trace.root_name?.trim()
  if (rootName) return rootName

  const pipelineId = trace.pipeline_id?.trim()
  if (pipelineId) return pipelineId

  const rootService = trace.root_service?.trim()
  if (rootService && !["run", "semantic", "spans", "mlair+spans"].includes(rootService)) {
    return rootService
  }

  const id = trace.trace_id
  return id.length > 16 ? `${id.slice(0, 16)}…` : id
}

function shortResourceId(id: string): string {
  const trimmed = id.trim()
  if (trimmed.length <= 14) return trimmed
  return `${trimmed.slice(0, 14)}…`
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
    return <WidgetSkeleton lines={4} />
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
            className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{traceTitle(trace)}</div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  {trace.pipeline_id?.trim() && trace.root_name?.trim() ? (
                    <span className="truncate font-mono">{trace.pipeline_id}</span>
                  ) : null}
                  {trace.run_id?.trim() ? (
                    <>
                      <span className="text-muted-foreground/70">Run</span>
                      <Link
                        href={`/runs/${encodeURIComponent(trace.run_id.trim())}`}
                        className="truncate font-mono text-primary hover:text-primary/80"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {shortResourceId(trace.run_id)}
                      </Link>
                    </>
                  ) : null}
                  <span className="text-muted-foreground/70">Trace</span>
                  <TraceLink
                    traceId={trace.trace_id}
                    variant="link"
                    label={shortResourceId(trace.trace_id)}
                    className="text-[10px]"
                  />
                </div>
              </div>
              <span className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {formatWaterfallDuration(trace.duration_ms)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Link href="/traces" className="shrink-0 text-[10px] text-primary hover:text-primary/80">
        Open trace viewer →
      </Link>
    </div>
  )
}
