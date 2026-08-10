"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Play, GitCompare } from "lucide-react"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { RunComparePanel } from "@/components/mlops/run-compare-panel"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { TraceLink } from "@/components/mlops/trace-link"
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { StatusBadge } from "@/components/mlops/status-badge"
import { formatDateTimeCompact, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { formatRuntimeSeconds } from "@/lib/usage-format"
import { computeRunWallDurationSeconds } from "@/lib/run-duration"
import { useWallClockNow } from "@/hooks/use-wall-clock-now"
import { useAppContext } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import type { RunItem } from "@/lib/api"
import { useRunsListLive } from "@/hooks/use-runs-list-live"
import { SCOPE_AGGREGATE_RUNS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { isActiveExecutionStatus, normalizeStatus } from "@/lib/status-style"

function pickTraceId(run: RunItem): string | null {
  const c = run.config_snapshot
  if (!c || typeof c !== "object" || Array.isArray(c)) return null
  const o = c as Record<string, unknown>
  const v = o.trace_id ?? o.traceId
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function buildRunListColumns(nowMs: number): DataTableColumn<RunItem>[] {
  return [
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
    getSortValue: (run) => computeRunWallDurationSeconds(run, undefined, nowMs) ?? -1,
    cell: (run) => {
      const seconds = computeRunWallDurationSeconds(run, undefined, nowMs)
      return (
        <span className="font-mono text-sm text-muted-foreground">
          {seconds == null ? "—" : formatRuntimeSeconds(seconds)}
        </span>
      )
    },
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
}

export default function RunsPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerPipelineId, setTriggerPipelineId] = useState<string | undefined>()
  const [triggerMode, setTriggerMode] = useState<TriggerRunMode>("simple")
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareRuns, setCompareRuns] = useState<RunItem[]>([])

  const openTrigger = (pipelineId?: string, mode: TriggerRunMode = "simple") => {
    setTriggerPipelineId(pipelineId)
    setTriggerMode(mode)
    setTriggerOpen(true)
  }

  const runsQuery = useRunsListLive(Boolean(token?.trim()))
  const rows = runsQuery.items
  const showLoadMore = runsQuery.scopePinned && runsQuery.hasNextPage
  const hasActiveRun = useMemo(
    () => rows.some((run) => isActiveExecutionStatus(run.status)),
    [rows],
  )
  const wallClockNowMs = useWallClockNow(hasActiveRun)
  const runListColumns = useMemo(() => buildRunListColumns(wallClockNowMs), [wallClockNowMs])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TriggerRunUrlSync
        enabled={scopePinned}
        onOpen={({ pipelineId, mode }) => openTrigger(pipelineId, mode)}
      />

      <ResourcePageHeader
        className="shrink-0"
        icon={Play}
        accent="zinc"
        title="Runs"
      />

      <TriggerRunDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        defaultPipelineId={triggerPipelineId}
        mode={triggerMode}
        onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
      />

      <RunComparePanel
        open={compareOpen}
        onOpenChange={setCompareOpen}
        tenantId={tenantId}
        projectId={projectId}
        token={token}
        runs={compareRuns}
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
          emptyTitle="No runs"
        >
          <MlopsDataTable
            className="min-h-0 flex-1"
            tableId="runs-list"
            columns={runListColumns}
            data={rows}
            keyExtractor={(r) => r.run_id}
            onRowClick={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
            emptyMessage="No runs."
            loading={runsQuery.isRefetching && rows.length > 0}
            stickyFirstColumn
            bulkActions={({ selectedRows }) =>
              selectedRows.length >= 2 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCompareRuns(selectedRows)
                    setCompareOpen(true)
                  }}
                >
                  <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                  Compare {selectedRows.length} runs
                </Button>
              ) : null
            }
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
