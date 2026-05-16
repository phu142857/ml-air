"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Play, Clock, CheckCircle2, XCircle, Loader2, Ban, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import { DataTable as MlopsDataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { JaegerLink } from "@/components/mlops/jaeger-link"
import { ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { cn, formatDateTimeCompact, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { fetchRuns, type RunItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { SCOPE_AGGREGATE_RUNS } from "@/lib/scope-messages"
import { isScopePinned } from "@/lib/scope"
import { normalizeStatus } from "@/lib/status-style"

const statusConfig = {
  queued: { icon: Clock, label: "Queued", color: "text-muted-foreground", bg: "bg-muted", animate: false },
  running: { icon: Loader2, label: "Running", color: "text-sky-400", bg: "bg-sky-500/10", animate: true },
  success: { icon: CheckCircle2, label: "Success", color: "text-emerald-400", bg: "bg-emerald-500/10", animate: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400", bg: "bg-red-500/10", animate: false },
  cancelled: { icon: Ban, label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted", animate: false },
}

function runStatusRowKey(status: string): keyof typeof statusConfig {
  const t = normalizeStatus(status)
  if (t === "SUCCESS") return "success"
  if (t === "FAILED") return "failed"
  if (t === "RUNNING") return "running"
  if (t === "QUEUED") return "queued"
  return "cancelled"
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
    cell: (run) => <span className="font-mono text-sm text-sky-400">{run.run_id}</span>,
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
      const sk = runStatusRowKey(run.status)
      const status = statusConfig[sk]
      const StatusIcon = status.icon
      return (
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
            status.bg,
            status.color,
          )}
        >
          <StatusIcon className={cn("h-3 w-3", status.animate && "animate-spin")} />
          {status.label}
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

  const runsQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })

  const rows = runsQuery.data?.items ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TriggerRunUrlSync
        enabled={scopePinned}
        onOpen={({ pipelineId, mode }) => openTrigger(pipelineId, mode)}
      />

      <ResourcePageHeader
        icon={Play}
        accent="sky"
        title="Runs"
        subtitle={isAggregate ? `All projects · ${rows.length} runs` : `${rows.length} runs`}
        actions={
          <>
            <span
              className="inline-flex"
              title={!scopePinned ? "Select a specific tenant and project to start a run." : undefined}
            >
              <Button
                type="button"
                size="sm"
                className="h-8 gap-2 bg-sky-600 text-white hover:bg-sky-500"
                disabled={!token.trim() || !scopePinned}
                onClick={() => openTrigger()}
              >
                <Play className="h-3.5 w-3.5" />
                Trigger run
              </Button>
            </span>
            <TriggerRunDialog
              open={triggerOpen}
              onOpenChange={setTriggerOpen}
              defaultPipelineId={triggerPipelineId}
              mode={triggerMode}
              onSuccess={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
            />
          </>
        }
      />

      <div className="flex-1 space-y-6 overflow-auto p-6">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_RUNS} /> : null}
        <ScopedListContent
          isLoading={runsQuery.isLoading}
          isError={runsQuery.isError}
          errorMessage={runsQuery.error ? formatApiClientError(runsQuery.error) : undefined}
          isEmpty={rows.length === 0}
          emptyIcon={Play}
          emptyTitle="No runs in this scope"
          emptyDescription="Trigger a run or pick a workspace in the header."
        >
          <MlopsDataTable
            columns={runListColumns}
            data={rows}
            keyExtractor={(r) => r.run_id}
            onRowClick={(run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`)}
            emptyMessage="No runs."
          />
        </ScopedListContent>
      </div>
    </div>
  )
}
