"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Play, Clock, CheckCircle2, XCircle, Loader2, Ban, Bot } from "lucide-react"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { JaegerLink } from "@/components/mlops/jaeger-link"
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatDateTimeCompact, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import type { RunItem } from "@/lib/api"
import { useRunsListLive } from "@/hooks/use-runs-list-live"
import { SCOPE_AGGREGATE_RUNS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { statusChipKey, STATUS_CHIP_CLASS, type StatusChipKey } from "@/lib/status-style"

const statusMeta: Record<
  StatusChipKey,
  { icon: typeof Clock; label: string; animate: boolean }
> = {
  queued: { icon: Clock, label: "Queued", animate: false },
  pending: { icon: Clock, label: "Pending", animate: false },
  running: { icon: Loader2, label: "Running", animate: true },
  success: { icon: CheckCircle2, label: "Success", animate: false },
  failed: { icon: XCircle, label: "Failed", animate: false },
  cancelled: { icon: Ban, label: "Cancelled", animate: false },
}

function runDuration(r: RunItem): string {
  const c = r.created_at ? Date.parse(r.created_at) : NaN
  const u = r.updated_at ? Date.parse(r.updated_at) : NaN
  if (!Number.isFinite(c) || !Number.isFinite(u) || u < c) return "—"
  const s = Math.floor((u - c) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
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
    cell: (run) => <span className="font-mono text-sm text-primary">{run.run_id}</span>,
  },
  {
    id: "pipeline",
    header: "Pipeline",
    cell: (run) => <span className="font-mono text-sm text-foreground/90">{run.pipeline_id}</span>,
  },
  {
    id: "status",
    header: "Status",
    cell: (run) => {
      const sk = statusChipKey(run.status)
      const meta = statusMeta[sk]
      const StatusIcon = meta.icon
      return (
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            STATUS_CHIP_CLASS[sk],
          )}
        >
          <StatusIcon className={cn("h-3 w-3", meta.animate && "animate-spin")} />
          {meta.label}
        </div>
      )
    },
  },
  {
    id: "mode",
    header: "Mode",
    cell: (run) => (
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{run.training_mode || "—"}</span>
      </div>
    ),
  },
  {
    id: "started",
    header: "Started",
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
    cell: (run) => <span className="font-mono text-sm text-muted-foreground">{runDuration(run)}</span>,
  },
  {
    id: "trace",
    header: "Trace",
    cell: (run) => {
      const traceId = pickTraceId(run)
      return (
        <span onClick={(e) => e.stopPropagation()} className="inline-block">
          {traceId ? (
            <JaegerLink traceId={traceId} variant="link" />
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
            columns={runListColumns}
            data={rows}
            keyExtractor={(r) => r.run_id}
            onRowClick={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
            emptyMessage="No runs."
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
