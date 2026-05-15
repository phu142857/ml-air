"use client"

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  Terminal,
  BarChart3,
  FileBox,
  GitBranch,
  Network,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JaegerLink } from "@/components/mlops/jaeger-link"
import { cn, formatDateTimeCompact, formatApiClientError } from "@/lib/utils"
import { buildTaskDetailHref } from "@/lib/task-detail-href"
import { useAppContext } from "@/lib/app-context"
import {
  fetchRun,
  fetchRunTasks,
  fetchRunLogs,
  fetchRunTracking,
  type RunItem,
  type TaskItem,
} from "@/lib/api"
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog"
import { mlairKeys } from "@/lib/query-keys"
import { normalizeStatus } from "@/lib/status-style"

const statusConfig = {
  idle: { icon: Clock, label: "Idle", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-700", animate: false },
  pending: { icon: Clock, label: "Pending", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", animate: false },
  queued: { icon: Clock, label: "Queued", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-700", animate: false },
  running: { icon: Loader2, label: "Running", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30", animate: true },
  success: { icon: CheckCircle2, label: "Success", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", animate: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", animate: false },
  cancelled: { icon: Ban, label: "Cancelled", color: "text-zinc-500", bg: "bg-zinc-500/10", border: "border-zinc-700", animate: false },
}

function runStatusRowKey(status: string): keyof typeof statusConfig {
  const t = normalizeStatus(status)
  if (t === "SUCCESS") return "success"
  if (t === "FAILED") return "failed"
  if (t === "RUNNING") return "running"
  if (t === "QUEUED") return "queued"
  if (t === "PENDING") return "pending"
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

function mapTaskStatus(raw: string): keyof typeof statusConfig {
  const t = normalizeStatus(raw)
  if (t === "SUCCESS") return "success"
  if (t === "FAILED") return "failed"
  if (t === "RUNNING") return "running"
  if (t === "QUEUED") return "queued"
  if (t === "PENDING") return "pending"
  return "idle"
}

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const canScope = tenantId !== "all" && projectId !== "all"
  const enabled = Boolean(token?.trim()) && canScope
  const [rerunOpen, setRerunOpen] = useState(false)
  const [rerunMode, setRerunMode] = useState<"simple" | "gated">("simple")

  const runQuery = useQuery({
    queryKey: mlairKeys.run.detail(runId),
    queryFn: () => fetchRun(tenantId, projectId, runId, token),
    enabled,
  })

  const tasksQuery = useQuery({
    queryKey: mlairKeys.run.tasks(runId),
    queryFn: () => fetchRunTasks(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
  })

  const logsQuery = useQuery({
    queryKey: mlairKeys.run.logs(runId),
    queryFn: () => fetchRunLogs(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
  })

  const trackingQuery = useQuery({
    queryKey: mlairKeys.run.tracking(runId),
    queryFn: () => fetchRunTracking(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    retry: false,
  })

  const run = runQuery.data
  const sk = run ? runStatusRowKey(run.status) : "pending"
  const status = statusConfig[sk]
  const StatusIcon = status.icon
  const traceId = run ? pickTraceId(run) : null
  const tasks = tasksQuery.data?.items ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-100">
              <Link href="/runs">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", status.bg, status.border)}>
                <StatusIcon className={cn("h-5 w-5", status.color, status.animate && "animate-spin")} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-mono text-lg font-semibold text-zinc-100">{runId}</h1>
                  {run ? (
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
                        status.bg,
                        status.color,
                      )}
                    >
                      {status.label}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="font-mono text-zinc-400">{run?.pipeline_id ?? "—"}</span>
                  <span className="text-zinc-700">|</span>
                  <span>
                    Started{" "}
                    {run?.created_at ? formatDateTimeCompact(run.created_at) : runQuery.isLoading ? "…" : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {traceId ? <JaegerLink traceId={traceId} /> : null}
            {canScope ? (
              <Button variant="outline" size="sm" asChild className="h-8 gap-2 border-zinc-800 bg-zinc-900 text-xs">
                <Link href={`/lineage?run=${encodeURIComponent(runId)}`}>
                  <Network className="h-3.5 w-3.5" />
                  Lineage
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 border-zinc-800 bg-zinc-900 text-xs"
              disabled={!canScope || !run?.pipeline_id}
              title={!run?.pipeline_id ? "Pipeline id unavailable" : "POST /runs with same pipeline"}
              onClick={() => {
                setRerunMode("simple")
                setRerunOpen(true)
              }}
            >
              <Play className="h-3.5 w-3.5" />
              Re-run
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 border-amber-800/50 bg-zinc-900 text-xs text-amber-300"
              disabled={!canScope || !run?.pipeline_id}
              onClick={() => {
                setRerunMode("gated")
                setRerunOpen(true)
              }}
            >
              Gated re-run
            </Button>
            <TriggerRunDialog
              open={rerunOpen}
              onOpenChange={setRerunOpen}
              defaultPipelineId={run?.pipeline_id}
              mode={rerunMode}
              lockPipeline
              onSuccess={async (newRun) => {
                await queryClient.invalidateQueries({
                  queryKey: mlairKeys.runs.list(tenantId, projectId),
                  exact: false,
                })
                router.push(`/runs/${encodeURIComponent(newRun.run_id)}`)
              }}
            />
          </div>
        </div>
      </div>

      {!canScope ? (
        <div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Pick a specific tenant and project in the header to load this run from the API.
        </div>
      ) : null}

      {runQuery.isError ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {formatApiClientError(runQuery.error)}
        </div>
      ) : null}

      <Tabs defaultValue="overview" className="flex flex-1 flex-col">
        <div className="border-b border-zinc-800 px-6">
          <TabsList className="h-10 gap-4 bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="rounded-none px-0 pb-3 text-sm data-[state=active]:border-b-2 data-[state=active]:border-sky-500 data-[state=active]:bg-transparent"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="rounded-none px-0 pb-3 text-sm data-[state=active]:border-b-2 data-[state=active]:border-sky-500 data-[state=active]:bg-transparent"
            >
              <Terminal className="mr-1.5 h-3.5 w-3.5" />
              Logs
            </TabsTrigger>
            <TabsTrigger
              value="metrics"
              className="rounded-none px-0 pb-3 text-sm data-[state=active]:border-b-2 data-[state=active]:border-sky-500 data-[state=active]:bg-transparent"
            >
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Metrics
            </TabsTrigger>
            <TabsTrigger
              value="artifacts"
              className="rounded-none px-0 pb-3 text-sm data-[state=active]:border-b-2 data-[state=active]:border-sky-500 data-[state=active]:bg-transparent"
            >
              <FileBox className="mr-1.5 h-3.5 w-3.5" />
              Artifacts
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 flex-1 overflow-auto p-6">
          {runQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading run…
            </div>
          ) : run ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-sm font-medium text-zinc-300">Run details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Run ID</span>
                    <span className="font-mono text-zinc-200">{run.run_id}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Pipeline</span>
                    <span className="font-mono text-zinc-200">{run.pipeline_id}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Tenant / project</span>
                    <span className="font-mono text-xs text-zinc-200">
                      {run.tenant_id} / {run.project_id}
                    </span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Training mode</span>
                    <span className="text-zinc-200">{run.training_mode ?? "—"}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Created</span>
                    <span className="font-mono text-xs text-zinc-200">
                      {run.created_at ? formatDateTimeCompact(run.created_at) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Updated</span>
                    <span className="font-mono text-xs text-zinc-200">
                      {run.updated_at ? formatDateTimeCompact(run.updated_at) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Duration (wall)</span>
                    <span className="font-mono text-zinc-200">{runDuration(run)}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-zinc-500">Priority</span>
                    <span className="text-zinc-200">{run.priority ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-sm font-medium text-zinc-300">Tasks</h3>
                {tasksQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tasks…
                  </div>
                ) : tasksQuery.isError ? (
                  <p className="text-sm text-red-300">{formatApiClientError(tasksQuery.error)}</p>
                ) : tasks.length === 0 ? (
                  <p className="text-sm text-zinc-500">No tasks returned for this run.</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task: TaskItem, index: number) => {
                      const tsk = mapTaskStatus(task.status)
                      const st = statusConfig[tsk] || statusConfig.pending
                      const TI = st.icon
                      return (
                        <div key={task.task_id} className="flex items-center gap-3">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-500">
                            {index + 1}
                          </div>
                          <div className="flex flex-1 items-center justify-between gap-2">
                            <Link
                              href={buildTaskDetailHref(task.task_id, {
                                tenant_id: runQuery.data?.tenant_id ?? tenantId,
                                project_id: runQuery.data?.project_id ?? projectId,
                                run_id: runId,
                              })}
                              className="truncate font-mono text-sm text-sky-400 hover:underline"
                            >
                              {task.task_id}
                            </Link>
                            <div
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs",
                                st.bg,
                                st.color,
                              )}
                            >
                              <TI className={cn("h-3 w-3", st.animate && "animate-spin")} />
                              {st.label}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="logs" className="mt-0 flex-1 overflow-auto p-6">
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
              <span className="text-xs text-zinc-500">Run logs</span>
              {logsQuery.isFetching ? (
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Refreshing
                </span>
              ) : null}
            </div>
            <div className="max-h-[500px] space-y-1 overflow-auto p-4 font-mono text-xs">
              {logsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading logs…
                </div>
              ) : logsQuery.isError ? (
                <p className="text-red-300">{formatApiClientError(logsQuery.error)}</p>
              ) : (logsQuery.data?.items ?? []).length === 0 ? (
                <p className="text-zinc-500">No log lines yet.</p>
              ) : (
                (logsQuery.data?.items ?? []).map((log, index) => (
                  <div key={`${log.ts}-${index}`} className="flex gap-4">
                    <span className="shrink-0 text-zinc-600">
                      {log.ts ? new Date(log.ts).toLocaleTimeString() : "—"}
                    </span>
                    <span
                      className={cn(
                        "w-12 shrink-0",
                        String(log.level).toUpperCase() === "INFO" && "text-sky-400",
                        String(log.level).toUpperCase() === "WARN" && "text-amber-400",
                        String(log.level).toUpperCase() === "ERROR" && "text-red-400",
                      )}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-zinc-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="mt-0 flex-1 overflow-auto p-6">
          {trackingQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading metrics…
            </div>
          ) : trackingQuery.isError ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-400">
              {formatApiClientError(trackingQuery.error)}
            </div>
          ) : (trackingQuery.data?.metrics ?? []).length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/30 text-zinc-500">
              <div className="text-center">
                <BarChart3 className="mx-auto mb-2 h-10 w-10 text-zinc-700" />
                <p className="text-sm">No logged metrics for this run.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2">Key</th>
                    <th className="px-4 py-2">Value</th>
                    <th className="px-4 py-2">Step</th>
                    <th className="px-4 py-2">Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {(trackingQuery.data?.metrics ?? []).map((m, i) => (
                    <tr key={`${m.key}-${m.step}-${i}`} className="border-b border-zinc-800 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-zinc-300">{m.key}</td>
                      <td className="px-4 py-2 font-mono text-zinc-200">{m.value}</td>
                      <td className="px-4 py-2 text-zinc-400">{m.step}</td>
                      <td className="px-4 py-2 text-xs text-zinc-500">{formatDateTimeCompact(m.logged_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="artifacts" className="mt-0 flex-1 overflow-auto p-6">
          {trackingQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading artifacts…
            </div>
          ) : trackingQuery.isError ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-center text-sm text-zinc-400">
              {formatApiClientError(trackingQuery.error)}
            </div>
          ) : (trackingQuery.data?.artifacts ?? []).length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/30 text-zinc-500">
              <div className="text-center">
                <FileBox className="mx-auto mb-2 h-10 w-10 text-zinc-700" />
                <p className="text-sm">No artifacts recorded for this run.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2 rounded-lg border border-zinc-800 p-4">
              {(trackingQuery.data?.artifacts ?? []).map((a) => (
                <li key={a.artifact_id} className="flex flex-col gap-1 border-b border-zinc-800/80 py-2 last:border-0">
                  <span className="font-mono text-xs text-zinc-300">{a.path}</span>
                  {a.uri ? (
                    <a href={a.uri} className="text-xs text-sky-400 hover:underline" target="_blank" rel="noreferrer">
                      {a.uri}
                    </a>
                  ) : null}
                  <span className="text-[10px] text-zinc-600">{formatDateTimeCompact(a.logged_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
