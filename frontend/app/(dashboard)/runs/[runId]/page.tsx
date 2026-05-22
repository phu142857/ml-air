"use client"

import { use, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  Terminal,
  BarChart3,
  FileBox,
  Network,
  ListTodo,
  Activity,
  FileDown,
} from "lucide-react"
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { JaegerLink } from "@/components/mlops/jaeger-link"
import { AuditTimeline } from "@/components/mlops/audit-timeline"
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { DetailTabSkeleton } from "@/components/mlops/detail-tab-skeleton"
import { StatusBadge } from "@/components/mlops/status-badge"
import {
  DetailSection,
  DetailTabList,
  MetadataGrid,
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
} from "@/components/mlops/layout"
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog"
import { RunExecutionGraph } from "@/components/mlops/run-execution-graph"
import { useRunExecutionGraph } from "@/hooks/use-run-execution-graph"
import { useExecutionStore } from "@/lib/execution-store"
import { cn, formatDateTimeCompact, formatApiClientError } from "@/lib/utils"
import { isScopePinned } from "@/lib/scope"
import { SCOPE_AGGREGATE_RUN_DETAIL } from "@/lib/scope-messages"
import { statusToMlopsBadge } from "@/lib/status-style"
import { buildTaskDetailHref } from "@/lib/task-detail-href"
import { useAppContext } from "@/lib/app-context"
import {
  fetchRun,
  fetchRunTasks,
  fetchRunLogs,
  fetchRunTracking,
  fetchRunReadiness,
  fetchAuditTimeline,
  normalizeProjectId,
  type LogItem,
  type RunItem,
  type TaskItem,
  type RunReadiness,
  type ReadinessItem,
} from "@/lib/api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { mapAuditTimelineItems } from "@/lib/audit-event"
import { mlairKeys } from "@/lib/query-keys"
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling"
import { normalizeStatus } from "@/lib/status-style"
import { useTabLoading } from "@/hooks/use-tab-loading"
import { useChartTheme } from "@/hooks/use-chart-theme"

const RUN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "graph", label: "Execution graph", icon: <Network className="h-3.5 w-3.5" /> },
  { id: "tasks", label: "Tasks", icon: <ListTodo className="h-3.5 w-3.5" /> },
  { id: "logs", label: "Logs", icon: <Terminal className="h-3.5 w-3.5" /> },
  { id: "metrics", label: "Metrics", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "artifacts", label: "Artifacts", icon: <FileBox className="h-3.5 w-3.5" /> },
  { id: "timeline", label: "Timeline", icon: <Clock className="h-3.5 w-3.5" /> },
] as const

const RUN_TAB_SKELETON: Record<string, "grid" | "table" | "terminal" | "chart"> = {
  overview: "grid",
  graph: "grid",
  tasks: "table",
  logs: "terminal",
  metrics: "chart",
  artifacts: "table",
  timeline: "grid",
}

function RunTabPanel({
  loading,
  variant,
  children,
}: {
  loading: boolean
  variant: "grid" | "table" | "terminal" | "chart"
  children: React.ReactNode
}) {
  if (loading) return <DetailTabSkeleton variant={variant} />
  return <>{children}</>
}

function logTaskSuffix(log: LogItem): string | null {
  const p = log.payload
  if (!p) return null
  const parts: string[] = []
  if (typeof p.plugin === "string" && p.plugin) parts.push(p.plugin)
  if (typeof p.task_id === "string" && p.task_id) {
    const short = p.task_id.includes(":") ? p.task_id.split(":").pop()! : p.task_id
    parts.push(short)
  }
  return parts.length ? parts.join(" · ") : null
}

function LogLineRow({ log }: { log: LogItem }) {
  const suffix = logTaskSuffix(log)
  return (
    <div className="flex gap-3">
      <span className="w-[84px] shrink-0 tabular-nums text-muted-foreground/80">
        {log.ts ? new Date(log.ts).toLocaleTimeString() : "—"}
      </span>
      <span
        className={cn(
          "w-14 shrink-0",
          String(log.level).toUpperCase() === "INFO" && "text-sky-400",
          String(log.level).toUpperCase() === "DEBUG" && "text-violet-400",
          String(log.level).toUpperCase() === "WARN" && "text-amber-400",
          String(log.level).toUpperCase() === "ERROR" && "text-red-400",
        )}
      >
        [{log.level}]
      </span>
      {suffix ? (
        <span className="w-[min(140px,22vw)] shrink-0 truncate text-muted-foreground/70" title={suffix}>
          {suffix}
        </span>
      ) : (
        <span className="w-[min(140px,22vw)] shrink-0" />
      )}
      <span className="min-w-0 break-words text-foreground/90">{log.message}</span>
    </div>
  )
}

const statusConfig = {
  idle: { icon: Clock, label: "Idle", color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border", animate: false },
  pending: { icon: Clock, label: "Pending", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", animate: false },
  queued: { icon: Clock, label: "Queued", color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border", animate: false },
  running: { icon: Loader2, label: "Running", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30", animate: true },
  success: { icon: CheckCircle2, label: "Success", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", animate: false },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", animate: false },
  cancelled: { icon: Ban, label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border", animate: false },
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

function taskStatusForBadge(status: string) {
  const t = normalizeStatus(status)
  if (t === "SUCCESS") return "success" as const
  if (t === "FAILED") return "failed" as const
  if (t === "RUNNING") return "running" as const
  if (t === "QUEUED" || t === "PENDING") return "pending" as const
  return "pending" as const
}

interface GateResultRow {
  id: string
  gate: string
  result: "pass" | "fail" | "pending"
  observed: string
  required: string
}

function readinessItemResult(item: ReadinessItem): GateResultRow["result"] {
  const s = String(item.status || "").toLowerCase()
  if (s.includes("ready") || s.includes("pass") || s.includes("ok")) return "pass"
  if (s.includes("block") || s.includes("fail") || s.includes("deny")) return "fail"
  return "pending"
}

function readinessToGateRows(readiness: RunReadiness | undefined): GateResultRow[] {
  if (!readiness) return []
  const rows = [...(readiness.details || []), ...(readiness.blocking_datasets || [])]
  return rows.map((item, i) => ({
    id: `${item.dataset}-${item.role}-${i}`,
    gate: item.role ? `${item.dataset} (${item.role})` : item.dataset,
    result: readinessItemResult(item),
    observed: item.actual_size != null ? item.actual_size.toLocaleString() : "—",
    required: item.required_size != null ? `${item.required_size.toLocaleString()} rows` : "—",
  }))
}

function buildMetricsChartSeries(metrics: Array<{ key: string; value: number; step: number }>) {
  const byStep = new Map<number, Record<string, number | string>>()
  for (const m of metrics) {
    const step = m.step ?? 0
    if (!byStep.has(step)) byStep.set(step, { step: String(step) })
    byStep.get(step)![m.key] = m.value
  }
  return [...byStep.values()].sort((a, b) => Number(a.step) - Number(b.step))
}

function metricChartKeys(metrics: Array<{ key: string; value: number; step: number }>): string[] {
  const keys = new Set<string>()
  for (const m of metrics) keys.add(m.key)
  return [...keys].slice(0, 4)
}

const CHART_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24"]

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const canScope = isScopePinned(tenantId, projectId)
  const isAggregate = !canScope
  const enabled = Boolean(token?.trim()) && canScope
  const [tab, setTab] = useState("overview")
  const isTabLoading = useTabLoading(tab)
  const chartTheme = useChartTheme()
  const [rerunOpen, setRerunOpen] = useState(false)
  const [rerunMode, setRerunMode] = useState<"simple" | "gated">("simple")

  const poll = useRealtimeQueryPolling()
  const hydrateRunSnapshot = useExecutionStore((s) => s.hydrateRunSnapshot)
  const storeRun = useExecutionStore((s) => s.runs[runId])
  const storeTasks = useExecutionStore((s) => s.tasksByRun[runId])

  const activeRunRefetchMs = (status: string | undefined) => {
    const st = normalizeStatus(String(status ?? storeRun?.status ?? ""))
    return st === "RUNNING" || st === "PENDING" || st === "QUEUED" ? 4000 : false
  }

  const runQuery = useQuery({
    queryKey: mlairKeys.run.detail(runId),
    queryFn: () => fetchRun(tenantId, projectId, runId, token),
    enabled,
    refetchOnMount: "always",
    refetchInterval: (q) => activeRunRefetchMs(q.state.data?.status) || poll.refetchInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const tasksQuery = useQuery({
    queryKey: mlairKeys.run.tasks(runId),
    queryFn: () => fetchRunTasks(tenantId, projectId, runId, token),
    enabled,
    refetchOnMount: "always",
    refetchInterval: () => activeRunRefetchMs(runQuery.data?.status) || poll.refetchInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  useRunExecutionGraph(tenantId, projectId, runId, token, enabled)

  const logsQuery = useQuery({
    queryKey: mlairKeys.run.logs(runId),
    queryFn: () => fetchRunLogs(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    refetchOnMount: "always",
    refetchInterval: () => activeRunRefetchMs(runQuery.data?.status) || poll.refetchInterval,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const [logTaskFilter, setLogTaskFilter] = useState<string>("all")

  const trackingQuery = useQuery({
    queryKey: mlairKeys.run.tracking(runId),
    queryFn: () => fetchRunTracking(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    retry: false,
  })

  const readinessQuery = useQuery({
    queryKey: mlairKeys.run.readiness(runId),
    queryFn: () => fetchRunReadiness(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    retry: false,
  })

  const timelineQuery = useQuery({
    queryKey: [...mlairKeys.run.detail(runId), "audit-timeline"] as const,
    queryFn: () =>
      fetchAuditTimeline(tenantId, projectId, token, {
        limit: 50,
        filters: { resourceType: "run", resourceId: runId },
      }),
    enabled: enabled && Boolean(runQuery.data),
  })

  useEffect(() => {
    if (runQuery.data && tasksQuery.data?.items) {
      hydrateRunSnapshot(runQuery.data, tasksQuery.data.items)
    }
  }, [runQuery.data, tasksQuery.data?.items, hydrateRunSnapshot])

  const run = useMemo(() => {
    const base = runQuery.data
    if (!base) return storeRun
    if (!storeRun) return base
    return { ...base, ...storeRun, status: storeRun.status ?? base.status }
  }, [runQuery.data, storeRun])

  const sk = run ? runStatusRowKey(run.status) : "pending"
  const status = statusConfig[sk]
  const traceId = run ? pickTraceId(run) : null
  const tasks = useMemo(() => {
    const fromStore = storeTasks ? Object.values(storeTasks) : []
    if (fromStore.length) return fromStore
    return tasksQuery.data?.items ?? []
  }, [storeTasks, tasksQuery.data?.items])

  const logTaskOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tasks) {
      if (t.task_id) ids.add(t.task_id)
    }
    for (const log of logsQuery.data?.items ?? []) {
      const tid = log.payload?.task_id
      if (typeof tid === "string" && tid) ids.add(tid)
    }
    return Array.from(ids).sort()
  }, [tasks, logsQuery.data?.items])

  const displayedLogs = useMemo(() => {
    const items = logsQuery.data?.items ?? []
    if (logTaskFilter === "all") return items
    return items.filter((log) => log.payload?.task_id === logTaskFilter)
  }, [logsQuery.data?.items, logTaskFilter])

  const gateResults = useMemo(() => readinessToGateRows(readinessQuery.data), [readinessQuery.data])
  const timelineEvents = useMemo(
    () => mapAuditTimelineItems(timelineQuery.data?.items ?? []),
    [timelineQuery.data],
  )
  const metricsSeries = useMemo(
    () => buildMetricsChartSeries(trackingQuery.data?.metrics ?? []),
    [trackingQuery.data],
  )
  const chartMetricKeys = useMemo(
    () => metricChartKeys(trackingQuery.data?.metrics ?? []),
    [trackingQuery.data],
  )

  const gateColumns: DataTableColumn<GateResultRow>[] = useMemo(
    () => [
      {
        id: "gate",
        header: "Gate",
        cell: (row) => <span className="font-mono text-xs text-foreground/90">{row.gate}</span>,
      },
      {
        id: "result",
        header: "Result",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] capitalize",
              row.result === "pass" && "border-emerald-500/40 text-emerald-400",
              row.result === "fail" && "border-red-500/40 text-red-400",
              row.result === "pending" && "border-amber-500/40 text-amber-400",
            )}
          >
            {row.result}
          </Badge>
        ),
      },
      {
        id: "observed",
        header: "Observed",
        cell: (row) => <span className="text-xs text-muted-foreground">{row.observed}</span>,
      },
      {
        id: "required",
        header: "Required",
        cell: (row) => <span className="text-xs text-muted-foreground">{row.required}</span>,
      },
    ],
    [],
  )

  const taskColumns: DataTableColumn<TaskItem>[] = useMemo(
    () => [
      {
        id: "id",
        header: "Task",
        cell: (row) => (
          <Link
            className="font-mono text-xs text-sky-400 hover:text-sky-300"
            href={buildTaskDetailHref(row.task_id, {
              tenant_id: run?.tenant_id ?? tenantId,
              project_id: run?.project_id ?? projectId,
              run_id: runId,
            })}
          >
            {row.task_id}
          </Link>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <StatusBadge status={taskStatusForBadge(row.status)} label={row.status} size="sm" />
        ),
      },
      {
        id: "attempt",
        header: "Attempt",
        cell: (row) => (
          <span className="text-xs text-muted-foreground tabular-nums">{row.attempt ?? "—"}</span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.updated_at ? formatDateTimeCompact(row.updated_at) : "—"}
          </span>
        ),
      },
    ],
    [run, runId, tenantId, projectId],
  )

  const runOverviewMetadataItems = useMemo(() => {
    if (!run) return []
    const scopeMatches =
      canScope &&
      String(run.tenant_id || "").trim() === String(tenantId || "").trim() &&
      normalizeProjectId(String(run.project_id || "")) === normalizeProjectId(String(projectId || ""))
    const items: Array<{ label: string; value: ReactNode; mono?: boolean }> = [
      { label: "Run ID", value: run.run_id, mono: true },
      { label: "Pipeline", value: run.pipeline_id, mono: true },
    ]
    if (!scopeMatches) {
      items.push({
        label: "Tenant / project",
        value: `${run.tenant_id} / ${run.project_id}`,
        mono: true,
      })
    }
    items.push(
      {
        label: "Status",
        value: <StatusBadge status={statusToMlopsBadge(run.status)} label={status.label} />,
      },
      {
        label: "Created",
        value: run.created_at ? formatDateTimeCompact(run.created_at) : "—",
        mono: true,
      },
      {
        label: "Updated",
        value: run.updated_at ? formatDateTimeCompact(run.updated_at) : "—",
        mono: true,
      },
      { label: "Duration", value: runDuration(run) },
      { label: "Training mode", value: run.training_mode ?? "—" },
      {
        label: "Trace",
        value: traceId ? (
          <JaegerLink traceId={traceId} variant="link" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      },
    )
    return items
  }, [run, canScope, tenantId, projectId, status.label, traceId])

  if (runQuery.isFetched && !runQuery.isLoading && !run && !runQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SubpageBreadcrumb
          segments={[
            { label: "Runs", href: "/runs" },
            { label: runId, mono: true },
          ]}
        />
        <ResourcePageHeader accent="sky" icon={Play} title="Run not found" subtitle={runId} className="border-b-0" />
        <div className="flex flex-1 items-center justify-center p-6">
          <MlopsEmptyState
            icon={Activity}
            title="Run not found"
            description="This run id could not be loaded. Check scope pinning and open Runs to pick a listed execution."
            action={
              <Button asChild size="sm" variant="outline" className="border-border bg-card">
                <Link href="/runs">Back to runs</Link>
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-background/50">
        <SubpageBreadcrumb
          className="border-b border-border/80"
          segments={[
            { label: "Runs", href: "/runs" },
            { label: runId, mono: true },
          ]}
        />
        <ResourcePageHeader
          accent="sky"
          icon={Play}
          title={runId}
          subtitle={
            run
              ? `${run.pipeline_id} · started ${run.created_at ? formatDateTimeCompact(run.created_at) : "—"} · ${runDuration(run)}`
              : runQuery.isLoading
                ? "Loading run…"
                : "Pipeline run detail"
          }
          className="border-b-0"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {run ? (
                <StatusBadge status={statusToMlopsBadge(run.status)} label={status.label} size="sm" />
              ) : null}
              {traceId ? <JaegerLink traceId={traceId} /> : null}
              {canScope ? (
                <Button variant="outline" size="sm" asChild className="h-8 gap-2 border-border bg-card text-xs">
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
                className="h-8 gap-2 border-border bg-card text-xs"
                disabled={!canScope || !run?.pipeline_id}
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
                className="h-8 gap-2 border-amber-500/30 bg-card text-xs text-amber-300"
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
          }
        />
      </div>

      {runQuery.isError ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {formatApiClientError(runQuery.error)}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <DetailTabList accent="sky" tabs={[...RUN_TABS]} />

        {isAggregate ? (
          <div className="shrink-0 px-6 pt-4">
            <ScopePinnedInline message={SCOPE_AGGREGATE_RUN_DETAIL} />
          </div>
        ) : null}

        <TabsContent value="overview" className="flex-1 overflow-auto p-6 mt-0 space-y-6">
          <RunTabPanel loading={isTabLoading && !runQuery.isLoading} variant={RUN_TAB_SKELETON.overview}>
            {runQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading run…
              </div>
            ) : run ? (
              <>
                <DetailSection
                  title="Run metadata"
                  description="Identifiers, timing, and execution context."
                  accentBorder="sky"
                >
                  <MetadataGrid columns={2} items={runOverviewMetadataItems} />
                </DetailSection>

                {readinessQuery.isSuccess && gateResults.length > 0 ? (
                  <DetailSection
                    title="Readiness gates"
                    description="Dataset readiness evaluated for this run."
                    accentBorder="sky"
                  >
                    <DataTable columns={gateColumns} data={gateResults} keyExtractor={(r) => r.id} />
                  </DetailSection>
                ) : null}
              </>
            ) : null}
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="graph" className="flex-1 overflow-auto p-6 mt-0">
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.graph}>
            <DetailSection
              title="Execution graph"
              description="Runtime DAG for this run only — node status reflects tasks in this execution."
              accentBorder="sky"
            >
              <RunExecutionGraph
                tenantId={tenantId}
                projectId={projectId}
                runId={runId}
                token={token}
                enabled={enabled}
                className="min-h-[320px]"
              />
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 overflow-auto p-6 mt-0">
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.tasks}>
            <DetailSection title="Tasks" description="Units of work recorded for this run.">
              {tasksQuery.isError ? (
                <p className="text-sm text-red-300">{formatApiClientError(tasksQuery.error)}</p>
              ) : (
                <DataTable
                  columns={taskColumns}
                  data={tasks}
                  keyExtractor={(r) => r.task_id}
                  emptyMessage="No tasks returned for this run."
                />
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="logs" className="flex-1 overflow-auto p-6 mt-0">
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.logs}>
            <DetailSection
              title="Runner logs"
              description="Run log stream (orchestration + worker). Filter by task when payload includes task_id."
              bodyClassName="p-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/80 px-4 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">stdout / stderr</span>
                  {logTaskOptions.length > 0 ? (
                    <Select value={logTaskFilter} onValueChange={setLogTaskFilter}>
                      <SelectTrigger className="h-7 w-[min(320px,70vw)] font-mono text-xs">
                        <SelectValue placeholder="All tasks" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tasks</SelectItem>
                        {logTaskOptions.map((tid) => (
                          <SelectItem key={tid} value={tid} className="font-mono text-xs">
                            {tid}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  {logsQuery.isFetching ? (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Refreshing
                    </span>
                  ) : null}
                  {run ? (
                    <span className="max-w-[min(280px,45vw)] truncate font-mono text-xs text-muted-foreground/80">
                      {run.run_id}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="max-h-[min(520px,55vh)] space-y-1 overflow-auto bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                {logsQuery.isError ? (
                  <p className="text-red-300">{formatApiClientError(logsQuery.error)}</p>
                ) : displayedLogs.length === 0 ? (
                  <p className="text-muted-foreground">
                    {logTaskFilter === "all" ? "No log lines yet." : "No log lines for this task."}
                  </p>
                ) : (
                  displayedLogs.map((log, index) => (
                    <LogLineRow key={`${log.ts}-${log.payload?.task_id ?? ""}-${index}`} log={log} />
                  ))
                )}
              </div>
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="metrics" className="flex-1 overflow-auto p-6 mt-0">
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.metrics}>
            <DetailSection title="Training metrics" description="Logged metrics for this run.">
              {trackingQuery.isError ? (
                <p className="text-sm text-muted-foreground">{formatApiClientError(trackingQuery.error)}</p>
              ) : metricsSeries.length > 1 && chartMetricKeys.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metricsSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                      <XAxis dataKey="step" stroke={chartTheme.axisStroke} tick={{ fontSize: 11 }} />
                      <YAxis stroke={chartTheme.axisStroke} tick={{ fontSize: 11 }} width={36} />
                      <Tooltip
                        contentStyle={{ ...chartTheme.tooltipStyle, borderRadius: 8, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {chartMetricKeys.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={key}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (trackingQuery.data?.metrics ?? []).length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-card/80 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2">Key</th>
                        <th className="px-4 py-2">Value</th>
                        <th className="px-4 py-2">Step</th>
                        <th className="px-4 py-2">Logged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trackingQuery.data?.metrics ?? []).map((m, i) => (
                        <tr key={`${m.key}-${m.step}-${i}`} className="border-b border-border last:border-0">
                          <td className="px-4 py-2 font-mono text-xs">{m.key}</td>
                          <td className="px-4 py-2 font-mono">{m.value}</td>
                          <td className="px-4 py-2 text-muted-foreground">{m.step}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {formatDateTimeCompact(m.logged_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <MlopsEmptyState
                  icon={BarChart3}
                  title="No metrics"
                  description="No logged metrics for this run yet."
                />
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="artifacts" className="flex-1 overflow-auto p-6 mt-0">
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.artifacts}>
            <DetailSection title="Artifacts" description="Output blobs produced by the runner.">
              {trackingQuery.isError ? (
                <p className="text-sm text-muted-foreground">{formatApiClientError(trackingQuery.error)}</p>
              ) : (trackingQuery.data?.artifacts ?? []).length === 0 ? (
                <MlopsEmptyState
                  icon={FileBox}
                  title="No artifacts"
                  description="No artifacts recorded for this run."
                />
              ) : (
                <ul className="space-y-2">
                  {(trackingQuery.data?.artifacts ?? []).map((a) => (
                    <li key={a.artifact_id}>
                      {a.uri ? (
                        <a
                          href={a.uri}
                          className="group inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileDown className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                          {a.path || a.uri}
                        </a>
                      ) : (
                        <span className="font-mono text-sm text-foreground/90">{a.path}</span>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatDateTimeCompact(a.logged_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="timeline" className="flex-1 overflow-auto p-6 mt-0">
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.timeline}>
            <DetailSection
              title="Audit timeline"
              description="Semantic events for this run from the audit API."
            >
              {timelineQuery.isError ? (
                <p className="text-sm text-red-300">{formatApiClientError(timelineQuery.error)}</p>
              ) : timelineEvents.length === 0 ? (
                <MlopsEmptyState
                  icon={Clock}
                  title="No timeline events"
                  description="No audit events matched this run id."
                />
              ) : (
                <AuditTimeline events={timelineEvents} />
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
