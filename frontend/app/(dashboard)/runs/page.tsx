"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Play } from "lucide-react"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { TraceLink } from "@/components/mlops/trace-link"
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { StatusBadge } from "@/components/mlops/status-badge"
import { formatDateTimeCompact, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { formatRuntimeSeconds } from "@/lib/usage-format"
import { useAppContext } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import type { RunItem } from "@/lib/api"
import { useRunsListLive } from "@/hooks/use-runs-list-live"
import { SCOPE_AGGREGATE_RUNS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { normalizeStatus } from "@/lib/status-style"

function runDurationSeconds(r: RunItem): number | null {
  const c = r.created_at ? Date.parse(r.created_at) : NaN
  const u = r.updated_at ? Date.parse(r.updated_at) : NaN
  if (!Number.isFinite(c) || !Number.isFinite(u) || u < c) return null
  return (u - c) / 1000
}

function runDuration(r: RunItem): string {
  const seconds = runDurationSeconds(r)
  return seconds == null ? "—" : formatRuntimeSeconds(seconds)
}

function pickTraceId(run: RunItem): string | null {
  const c = run.config_snapshot
  if (!c || typeof c !== "object" || Array.isArray(c)) return null
  const o = c as Record<string, unknown>
  const v = o.trace_id ?? o.traceId
  return typeof v === "string" && v.trim() ? v.trim() : null
}

const runListColumns: DataTableColumn<RunItem>[] = [
  {
    id: "run_id",
    header: "Run ID",
    width: 260,
    canHide: false,
    getSearchValue: (run) => run.run_id,
    getSortValue: (run) => run.run_id,
    cell: (run) => <span className="font-mono text-sm text-primary">{run.run_id}</span>,
  },
  {
    id: "pipeline",
    header: "Pipeline",
    width: 200,
    getSearchValue: (run) => run.pipeline_id,
    getSortValue: (run) => run.pipeline_id,
    getFilterValue: (run) => run.pipeline_id || null,
    cell: (run) => <span className="font-mono text-sm text-foreground/90">{run.pipeline_id}</span>,
  },
  {
    id: "status",
    header: "Status",
    width: 140,
    getSortValue: (run) => normalizeStatus(run.status),
    getFilterValue: (run) => normalizeStatus(run.status),
    filterOptions: [
      { label: "Pending", value: "PENDING" },
      { label: "Queued", value: "QUEUED" },
      { label: "Running", value: "RUNNING" },
      { label: "Success", value: "SUCCESS" },
      { label: "Failed", value: "FAILED" },
      { label: "Cancelled", value: "CANCELLED" },
    ],
    cell: (run) => <StatusBadge value={run.status} size="sm" />,
  },
  {
    id: "started",
    header: "Started",
    width: 180,
    getSortValue: (run) => run.created_at || run.updated_at || "",
    getSearchValue: (run) => run.created_at || run.updated_at || "",
    cell: (run) => {
      const started = run.created_at || run.updated_at
      return started ? (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">{formatDateTimeCompact(started)}</span>
          <span className="text-[10px] text-muted-foreground/80">{formatRelativeTime(started)}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground/80">—</span>
      )
    },
  },
  {
    id: "duration",
    header: "Duration",
    width: 120,
    getSortValue: (run) => runDurationSeconds(run) ?? -1,
    cell: (run) => <span className="font-mono text-sm text-muted-foreground">{runDuration(run)}</span>,
  },
  {
    id: "trace",
    header: "Trace",
    width: 200,
    getSearchValue: (run) => pickTraceId(run) ?? "",
    getSortValue: (run) => pickTraceId(run) ?? "",
    cell: (run) => {
      const traceId = pickTraceId(run)
      return (
        <span onClick={(e) => e.stopPropagation()} className="inline-block">
          {traceId ? (
            <TraceLink traceId={traceId} variant="link" />
          ) : (
            <span className="text-xs text-muted-foreground/80">—</span>
          )}
        </span>
      )
    },
  },
]

export default function RunsPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerPipelineId, setTriggerPipelineId] = useState<string | undefined>()
  const [triggerMode, setTriggerMode] = useState<TriggerRunMode>("simple")

  const openTrigger = (pipelineId?: string, mode: TriggerRunMode = "simple") => {
    setTriggerPipelineId(pipelineId)
    setTriggerMode(mode)
    setTriggerOpen(true)
  }

  const runsQuery = useRunsListLive(Boolean(token?.trim()))
  const rows = runsQuery.items
  const showLoadMore = runsQuery.scopePinned && runsQuery.hasNextPage

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TriggerRunUrlSync
        enabled={scopePinned}
        onOpen={({ pipelineId, mode }) => openTrigger(pipelineId, mode)}
      />

      <ResourcePageHeader
        className="shrink-0"
        icon={Play}
        accent="sky"
        title="Runs"
        subtitle={
          isAggregate
            ? `Run history · ${rows.length} runs · new runs from Dataset Hub`
            : `${rows.length} runs · observability (start from Dataset Hub → Run / Train)`
        }
      />

      <TriggerRunDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        defaultPipelineId={triggerPipelineId}
        mode={triggerMode}
        onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
      />

      <PageScrollBody
        variant="workspace"
        header={isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_RUNS} /> : null}
      >
        <ScopedListContent
          isLoading={runsQuery.isLoading}
          isError={runsQuery.isError}
          errorMessage={runsQuery.error ? formatApiClientError(runsQuery.error) : undefined}
          isEmpty={rows.length === 0}
          emptyIcon={Play}
          emptyTitle="No runs in this scope"
          emptyDescription="Start a run from Dataset Hub (Run / Train) or pick a workspace in the header."
        >
          <MlopsDataTable
            className="min-h-0 flex-1"
            tableId="runs-list"
            title="Runs"
            description="Search, filter by status/pipeline, and sort the run history."
            columns={runListColumns}
            data={rows}
            keyExtractor={(r) => r.run_id}
            onRowClick={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
            emptyMessage="No runs."
            loading={runsQuery.isFetching && rows.length > 0}
            stickyFirstColumn
          />
          {showLoadMore ? (
            <div className="flex justify-center border-t border-border/60 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={runsQuery.isFetchingNextPage}
                onClick={() => void runsQuery.fetchNextPage?.()}
              >
                {runsQuery.isFetchingNextPage ? "Loading…" : "Load more runs"}
              </Button>
            </div>
          ) : null}
        </ScopedListContent>
      </PageScrollBody>
    </div>
  )
}
