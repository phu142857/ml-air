"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Play, Clock, CheckCircle2, XCircle, Loader2, Ban, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TriggerRunDialog, type TriggerRunMode } from "@/components/mlops/trigger-run-dialog"
import { TriggerRunUrlSync } from "@/components/mlops/trigger-run-url-sync"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { JaegerLink } from "@/components/mlops/jaeger-link"
import { cn, formatDateTimeCompact, formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { fetchRuns, type RunItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { normalizeStatus } from "@/lib/status-style"

const statusConfig = {
  queued: { icon: Clock, label: "Queued", color: "text-zinc-400", bg: "bg-zinc-500/10", animate: false },
  running: { icon: Loader2, label: "Running", color: "text-sky-400", bg: "bg-sky-500/10", animate: true },
  success: { icon: CheckCircle2, label: "Success", color: "text-emerald-400", bg: "bg-emerald-500/10", animate: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400", bg: "bg-red-500/10", animate: false },
  cancelled: { icon: Ban, label: "Cancelled", color: "text-zinc-500", bg: "bg-zinc-500/10", animate: false },
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

export default function RunsPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerPipelineId, setTriggerPipelineId] = useState<string | undefined>()
  const [triggerMode, setTriggerMode] = useState<TriggerRunMode>("simple")
  const canTriggerScope = tenantId !== "all" && projectId !== "all"

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
    <div className="flex flex-col h-full">
      <TriggerRunUrlSync
        enabled={canTriggerScope}
        onOpen={({ pipelineId, mode }) => openTrigger(pipelineId, mode)}
      />
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-sky-600/10">
              <Play className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Runs</h1>
              <p className="text-xs text-zinc-500">
                Scope <span className="font-mono text-zinc-400">{tenantId}</span> /{" "}
                <span className="font-mono text-zinc-400">{projectId}</span>
              </p>
            </div>
          </div>

          <>
            <span
              className="inline-flex"
              title={!canTriggerScope ? "Select a specific tenant and project to start a run." : undefined}
            >
              <Button
                type="button"
                size="sm"
                className="h-8 gap-2 bg-sky-600 text-white hover:bg-sky-500"
                disabled={!token.trim() || !canTriggerScope}
                onClick={() => openTrigger()}
              >
                <Play className="h-3.5 w-3.5" />
                Trigger Run
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
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {runsQuery.isError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {formatApiClientError(runsQuery.error)}
          </div>
        ) : null}

        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="font-medium text-zinc-500">Run ID</TableHead>
                <TableHead className="font-medium text-zinc-500">Pipeline</TableHead>
                <TableHead className="font-medium text-zinc-500">Status</TableHead>
                <TableHead className="font-medium text-zinc-500">Mode</TableHead>
                <TableHead className="font-medium text-zinc-500">Started</TableHead>
                <TableHead className="font-medium text-zinc-500">Duration</TableHead>
                <TableHead className="font-medium text-zinc-500">Trace</TableHead>
                <TableHead className="w-[80px] font-medium text-zinc-500" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsQuery.isLoading ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500" />
                    Loading runs…
                  </TableCell>
                </TableRow>
              ) : null}
              {!runsQuery.isLoading && rows.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-500">
                    No runs in this scope (or API returned an empty list).
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((run) => {
                const sk = runStatusRowKey(run.status)
                const status = statusConfig[sk]
                const StatusIcon = status.icon
                const started = run.created_at || run.updated_at
                const traceId = pickTraceId(run)

                return (
                  <TableRow key={run.run_id} className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableCell>
                      <Link
                        href={`/runs/${run.run_id}`}
                        className="font-mono text-sm text-sky-400 hover:text-sky-300 hover:underline"
                      >
                        {run.run_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-zinc-300">{run.pipeline_id}</span>
                    </TableCell>
                    <TableCell>
                      <div
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                          status.bg,
                          status.color
                        )}
                      >
                        <StatusIcon className={cn("h-3 w-3", status.animate && "animate-spin")} />
                        {status.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-sm text-zinc-400">{run.training_mode || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {started ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-zinc-400">{formatDateTimeCompact(started)}</span>
                          <span className="text-[10px] text-zinc-600">{formatRelativeTime(started)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-zinc-400">{runDuration(run)}</span>
                    </TableCell>
                    <TableCell>
                      {traceId ? (
                        <JaegerLink traceId={traceId} variant="link" />
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-zinc-500 hover:text-zinc-100">
                        <Link href={`/runs/${run.run_id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
