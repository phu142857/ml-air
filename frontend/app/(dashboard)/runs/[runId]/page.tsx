"use client"

import { use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { TraceLink } from "@/components/mlops/trace-link"
import { AuditTimeline } from "@/components/mlops/audit-timeline"
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { RunTasksUsageTable } from "@/components/mlops/run-tasks-usage-table"
import { DetailTabSkeleton } from "@/components/mlops/detail-tab-skeleton"
import { StatusBadge } from "@/components/mlops/status-badge"
import {
  DetailSection,
  DetailTabList,
  MetadataGrid,
  MlopsEmptyState,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBackLink,
  tabPanelScrollClassName,
} from "@/components/mlops/layout"
import { RunMetricsSummary } from "@/components/mlops/run-metrics-summary"
import { RunMetricsCharts } from "@/components/mlops/run-metrics-charts"
import { TriggerRunDialog } from "@/components/mlops/trigger-run-dialog"
import { RunExecutionGraph } from "@/components/mlops/run-execution-graph"
import { ExecutionLogStream } from "@/components/mlops/execution-log-stream"
import { ExecutionLogToolbar } from "@/components/mlops/execution-log-toolbar"
import { useRunExecutionGraph } from "@/hooks/use-run-execution-graph"
import { useExecutionStore } from "@/lib/execution-store"
import { mergeRunListRow } from "@/lib/execution-live-merge"
import { cn, formatDateTimeCompact, formatApiClientError } from "@/lib/utils"
import { toastError, toastSuccess } from "@/lib/toast-actions"
import { formatRuntimeSeconds } from "@/lib/usage-format"
import { computeRunWallDurationSeconds } from "@/lib/run-duration"
import { useWallClockNow } from "@/hooks/use-wall-clock-now"
import { isScopePinned } from "@/lib/scope"
import { SCOPE_AGGREGATE_RUN_DETAIL } from "@/lib/scope-messages"
import {
  STATUS_CHIP_CLASS,
  statusChipKey,
  statusToMlopsBadge,
  normalizeStatus,
  isActiveExecutionStatus,
  type StatusChipKey,
} from "@/lib/status-style"
import { useAppContext } from "@/lib/app-context"
import { useAuditTimelineInfinite } from "@/hooks/use-audit-timeline-infinite"
import { useRunLogsInfinite } from "@/hooks/use-run-logs-infinite"
import {
  fetchRun,
  fetchRunTasks,
  fetchRunTracking,
  fetchRunUsage,
  fetchRunUsageSamples,
  fetchRunReadiness,
  downloadRunLogsExport,
  downloadRunMetricsExport,
  type LogSearchParams,
  cancelRun,
  normalizeProjectId,
  type LogItem,
  type RunItem,
  type TaskItem,
  type TaskUsageRecord,
  type TaskLiveUsage,
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
import { mlairKeys } from "@/lib/query-keys"
import {
  resolveActiveExecutionRefetchInterval,
  resolveRefetchInterval,
  useRealtimeQueryPolling,
} from "@/lib/realtime-query-polling"
import { useTabLoading } from "@/hooks/use-tab-loading"

const RUN_USAGE_LIVE_REFRESH_MS = 1000

const RUN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "graph", label: "Execution graph", icon: <Network className="h-3.5 w-3.5" /> },
  { id: "tasks", label: "Tasks & resources", icon: <ListTodo className="h-3.5 w-3.5" /> },
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
          String(log.level).toUpperCase() === "INFO" && "text-primary",
          String(log.level).toUpperCase() === "DEBUG" && "text-primary",
          String(log.level).toUpperCase() === "WARN" && "text-[color:var(--status-pending-fg)]",
          String(log.level).toUpperCase() === "ERROR" && "text-[color:var(--status-failed-fg)]",
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

const runStatusMeta: Record<
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

function pickTraceId(run: RunItem): string | null {
  const c = run.config_snapshot
  if (!c || typeof c !== "object" || Array.isArray(c)) return null
  const o = c as Record<string, unknown>
  const v = o.trace_id ?? o.traceId
  return typeof v === "string" && v.trim() ? v.trim() : null
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
  const [rerunOpen, setRerunOpen] = useState(false)
  const [rerunMode, setRerunMode] = useState<"simple" | "gated">("simple")
  const [exportingMetrics, setExportingMetrics] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(tenantId, projectId, runId, token),
    onSuccess: async () => {
      toastSuccess("Run cancellation requested", runId)
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.detail(runId) })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.tasks(runId) })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.logs(runId) })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.logsInfinite(runId) })
      await queryClient.invalidateQueries({ queryKey: ["audit-timeline", tenantId, projectId], exact: false })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.tracking(runId) })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.readiness(runId) })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.run.executionGraph(tenantId, projectId, runId) })
      await queryClient.invalidateQueries({ queryKey: mlairKeys.runs.list(tenantId, projectId), exact: false })
    },
    onError: (e) => toastError("Cancel failed", formatApiClientError(e)),
  })

  const poll = useRealtimeQueryPolling()
  const hydrateRunSnapshot = useExecutionStore((s) => s.hydrateRunSnapshot)
  const storeRun = useExecutionStore((s) => s.runs[runId])
  const storeTasks = useExecutionStore((s) => s.tasksByRun[runId])

  const runQuery = useQuery({
    queryKey: mlairKeys.run.detail(runId),
    queryFn: () => fetchRun(tenantId, projectId, runId, token),
    enabled,
    refetchInterval: (q) =>
      resolveActiveExecutionRefetchInterval(poll, q.state.data?.status ?? storeRun?.status),
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const tasksQuery = useQuery({
    queryKey: mlairKeys.run.tasks(runId),
    queryFn: () => fetchRunTasks(tenantId, projectId, runId, token),
    enabled,
    refetchInterval: () =>
      resolveActiveExecutionRefetchInterval(poll, runQuery.data?.status ?? storeRun?.status),
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  useRunExecutionGraph(tenantId, projectId, runId, token, enabled)

  const [logTaskFilter, setLogTaskFilter] = useState<string>("all")
  const [logSearch, setLogSearch] = useState<LogSearchParams>({})
  const [logExporting, setLogExporting] = useState(false)

  const logSearchEffective = useMemo((): LogSearchParams => {
    const taskId = logTaskFilter !== "all" ? logTaskFilter : logSearch.taskId
    return { ...logSearch, ...(taskId ? { taskId } : {}) }
  }, [logSearch, logTaskFilter])

  const runStatus = runQuery.data?.status ?? storeRun?.status
  const runIsActive = isActiveExecutionStatus(runStatus)
  const logsRefetchMs = resolveActiveExecutionRefetchInterval(poll, runStatus)
  const logsLive = runIsActive && tab === "logs"
  const logsQuery = useRunLogsInfinite(
    tenantId,
    projectId,
    runId,
    token,
    enabled && Boolean(runQuery.data),
    {
      streamLive: logsLive,
      refetchInterval: logsLive ? false : logsRefetchMs,
      search: logSearchEffective,
    },
  )

  const handleLogExport = useCallback(async () => {
    setLogExporting(true)
    try {
      await downloadRunLogsExport(tenantId, projectId, runId, token, {
        format: "jsonl",
        search: logSearchEffective,
      })
      toastSuccess("Export started", "Run logs download should begin shortly.")
    } catch (e) {
      toastError("Export failed", formatApiClientError(e))
    } finally {
      setLogExporting(false)
    }
  }, [tenantId, projectId, runId, token, logSearchEffective])

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [runTimelineTaskId, setRunTimelineTaskId] = useState<string>("all")
  const toggleExpandedTask = useCallback(
    (taskId: string) => setExpandedTaskId((prev) => (prev === taskId ? null : taskId)),
    [],
  )

  const trackingQuery = useQuery({
    queryKey: mlairKeys.run.tracking(runId),
    queryFn: () => fetchRunTracking(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    refetchInterval: () => resolveActiveExecutionRefetchInterval(poll, runStatus),
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
    retry: false,
  })

  const usageQuery = useQuery({
    queryKey: mlairKeys.run.usage(runId),
    queryFn: () => fetchRunUsage(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    refetchInterval: () =>
      resolveRefetchInterval(poll, { active: runIsActive, activeMs: RUN_USAGE_LIVE_REFRESH_MS }),
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
    retry: false,
  })

  const usageSamplesQuery = useQuery({
    queryKey: mlairKeys.run.usageSamples(runId, expandedTaskId ?? "none"),
    queryFn: () =>
      fetchRunUsageSamples(tenantId, projectId, runId, token, {
        taskId: expandedTaskId ?? undefined,
        limit: 1000,
      }),
    enabled:
      enabled && Boolean(runQuery.data) && tab === "tasks" && Boolean(expandedTaskId),
    refetchInterval: () =>
      tab === "tasks" && expandedTaskId
        ? resolveRefetchInterval(poll, { active: runIsActive, activeMs: RUN_USAGE_LIVE_REFRESH_MS })
        : false,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
    retry: false,
  })

  const runUsageSamplesQuery = useQuery({
    queryKey: mlairKeys.run.usageSamples(runId, runTimelineTaskId === "all" ? "all" : runTimelineTaskId),
    queryFn: () =>
      fetchRunUsageSamples(tenantId, projectId, runId, token, {
        taskId: runTimelineTaskId === "all" ? undefined : runTimelineTaskId,
        limit: 2000,
      }),
    enabled: enabled && Boolean(runQuery.data) && tab === "tasks",
    refetchInterval: () =>
      tab === "tasks"
        ? resolveRefetchInterval(poll, { active: runIsActive, activeMs: RUN_USAGE_LIVE_REFRESH_MS })
        : false,
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
    retry: false,
  })

  const readinessQuery = useQuery({
    queryKey: mlairKeys.run.readiness(runId),
    queryFn: () => fetchRunReadiness(tenantId, projectId, runId, token),
    enabled: enabled && Boolean(runQuery.data),
    retry: false,
  })

  const runAuditFilters = useMemo(
    () => ({ resourceType: "run", resourceId: runId }),
    [runId]
  )
  const timelineQuery = useAuditTimelineInfinite(
    runAuditFilters,
    enabled && Boolean(runQuery.data)
  )
  const timelineEvents = timelineQuery.events

  useEffect(() => {
    if (runQuery.data && tasksQuery.data?.items) {
      hydrateRunSnapshot(runQuery.data, tasksQuery.data.items)
    }
  }, [runQuery.data, tasksQuery.data?.items, hydrateRunSnapshot])

  const run = useMemo(() => {
    const base = runQuery.data
    if (!base) return storeRun
    if (!storeRun) return base
    return mergeRunListRow(base, storeRun)
  }, [runQuery.data, storeRun])

  const sk = run ? statusChipKey(run.status) : "pending"
  const status = runStatusMeta[sk]
  const traceId = run ? pickTraceId(run) : null
  const tasks = useMemo(() => {
    const fromStore = storeTasks ? Object.values(storeTasks) : []
    if (fromStore.length) return fromStore
    return tasksQuery.data?.items ?? []
  }, [storeTasks, tasksQuery.data?.items])

  const runWallClockNowMs = useWallClockNow(runIsActive)
  const runDurationLabel = useMemo(() => {
    if (!run) return "—"
    const seconds = computeRunWallDurationSeconds(run, tasks, runWallClockNowMs)
    return seconds == null ? "—" : formatRuntimeSeconds(seconds)
  }, [run, tasks, runWallClockNowMs])

  const logTaskOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tasks) {
      if (t.task_id) ids.add(t.task_id)
    }
    for (const log of logsQuery.items) {
      const tid = log.payload?.task_id
      if (typeof tid === "string" && tid) ids.add(tid)
    }
    return Array.from(ids).sort()
  }, [tasks, logsQuery.items])

  const displayedLogs = logsQuery.items

  const gateResults = useMemo(() => readinessToGateRows(readinessQuery.data), [readinessQuery.data])
  const handleExportMetrics = useCallback(
    async (format: "csv" | "jsonl") => {
      setExportingMetrics(true)
      try {
        await downloadRunMetricsExport(tenantId, projectId, runId, token, { format })
        toastSuccess("Metrics exported", format.toUpperCase())
      } catch (error) {
        toastError("Export failed", formatApiClientError(error))
      } finally {
        setExportingMetrics(false)
      }
    },
    [projectId, runId, tenantId, token],
  )

  const gateColumns: DataTableColumn<GateResultRow>[] = useMemo(
    () => [
      {
        id: "gate",
        header: "Gate",
        width: 260,
        canHide: false,
        getSearchValue: (row) => row.gate,
        getSortValue: (row) => row.gate,
        cell: (row) => <span className="font-mono text-xs text-foreground/90">{row.gate}</span>,
      },
      {
        id: "result",
        header: "Result",
        width: 120,
        getSortValue: (row) => row.result,
        getFilterValue: (row) => row.result,
        filterOptions: [
          { label: "Pass", value: "pass" },
          { label: "Fail", value: "fail" },
          { label: "Pending", value: "pending" },
        ],
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] capitalize",
              row.result === "pass" && "border-[color:var(--status-success-border)] text-[color:var(--status-success-fg)]",
              row.result === "fail" && "border-red-500/40 text-[color:var(--status-failed-fg)]",
              row.result === "pending" && "border-[color:var(--status-pending-border)] text-[color:var(--status-pending-fg)]",
            )}
          >
            {row.result}
          </Badge>
        ),
      },
      {
        id: "observed",
        header: "Observed",
        width: 140,
        getSortValue: (row) => row.observed,
        cell: (row) => <span className="text-xs text-muted-foreground">{row.observed}</span>,
      },
      {
        id: "required",
        header: "Required",
        width: 160,
        getSortValue: (row) => row.required,
        cell: (row) => <span className="text-xs text-muted-foreground">{row.required}</span>,
      },
    ],
    [],
  )

  const usageByTaskId = useMemo(() => {
    const map = new Map<string, TaskUsageRecord>()
    for (const row of usageQuery.data?.tasks ?? []) {
      map.set(row.task_id, row)
    }
    return map
  }, [usageQuery.data?.tasks])

  const liveByTaskId = useMemo(() => {
    const map = new Map<string, TaskLiveUsage>()
    for (const row of usageQuery.data?.live ?? []) {
      map.set(row.task_id, row)
    }
    return map
  }, [usageQuery.data?.live])

  const runEnvironmentMetadataItems = useMemo(() => {
    const env = run?.environment
    if (!env || typeof env !== "object") return []
    const git = env.git
    const gitLabel =
      git?.commit != null
        ? `${git.commit?.slice(0, 12) ?? "—"}${git.branch ? ` (${git.branch})` : ""}${git.dirty ? " *" : ""}${git.source === "build" ? " [build]" : ""}`
        : "unavailable"
    return [
      { label: "Captured at", value: env.captured_at ? formatDateTimeCompact(env.captured_at) : "—", mono: true },
      { label: "Capturer", value: env.capturer ?? env.service_name ?? "—" },
      { label: "Deployment", value: env.ml_air_environment ?? "—" },
      { label: "Runtime", value: env.runtime_kind ?? "—" },
      { label: "Python", value: env.python_version ?? "—", mono: true },
      { label: "Platform", value: env.platform ?? "—" },
      { label: "Machine", value: env.machine ?? "—", mono: true },
      { label: "CPU cores", value: env.cpu_count != null ? String(env.cpu_count) : "—" },
      { label: "Memory", value: env.memory_total_mb != null ? `${env.memory_total_mb} MB` : "—" },
      { label: "CUDA", value: env.cuda_version ?? "—", mono: true },
      { label: "GPU", value: env.gpu_name ?? "—" },
      { label: "Docker image", value: env.docker_image ?? "—", mono: true },
      { label: "Git", value: gitLabel, mono: true },
      { label: "Packages digest", value: env.python_packages_digest ?? "—", mono: true },
      { label: "Seed", value: env.random_seed ?? "—", mono: true },
    ]
  }, [run?.environment])

  if (runQuery.isFetched && !runQuery.isLoading && !run && !runQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SubpageBackLink href="/runs" label="Back to runs" />
        <ResourcePageHeader accent="sky" icon={Play} title="Run not found" subtitle={runId} className="border-b-0" />
        <div className="flex flex-1 items-center justify-center p-6">
          <MlopsEmptyState
            icon={Activity}
            title="Run not found"
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/70 bg-background/60 overflow-hidden">
        <SubpageBackLink href="/runs" label="Back to runs" />
        <ResourcePageHeader
          accent="sky"
          icon={Play}
          title={runId}
          subtitle={
            run
              ? `${run.pipeline_id} · started ${run.created_at ? formatDateTimeCompact(run.created_at) : "—"} · ${runDurationLabel}`
              : runQuery.isLoading
                ? "Loading…"
                : undefined
          }
          className="border-b-0"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {run ? (
                <StatusBadge status={statusToMlopsBadge(run.status)} label={status.label} size="sm" />
              ) : null}
              {traceId ? <TraceLink traceId={traceId} className="shrink-0" /> : null}
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
                className="h-8 gap-2 border-[color:var(--status-pending-border)] bg-card text-xs text-[color:var(--status-pending-fg)]"
                disabled={!canScope || !run?.pipeline_id}
                onClick={() => {
                  setRerunMode("gated")
                  setRerunOpen(true)
                }}
              >
                Gated re-run
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2 border-border bg-card text-xs"
                disabled={
                  !canScope ||
                  cancelMutation.isPending ||
                  !run ||
                  !["PENDING", "QUEUED", "RUNNING"].includes(String(run.status || "").toUpperCase())
                }
                onClick={() => {
                  if (!run) return
                  if (!window.confirm(`Cancel run ${runId}? Running tasks may continue until they finish.`)) return
                  cancelMutation.mutate()
                }}
              >
                {cancelMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Cancel
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

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <DetailTabList accent="sky" tabs={[...RUN_TABS]} />

        {runQuery.isError ? (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <div className="rounded-lg border border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] px-4 py-3 text-sm text-[color:var(--status-failed-fg)]">
              {formatApiClientError(runQuery.error)}
            </div>
          </div>
        ) : null}

        {isAggregate ? (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <ScopePinnedInline message={SCOPE_AGGREGATE_RUN_DETAIL} />
          </div>
        ) : null}

        <TabsContent value="overview" className={tabPanelScrollClassName("space-y-6")}>
          <RunTabPanel loading={isTabLoading && !runQuery.isLoading} variant={RUN_TAB_SKELETON.overview}>
            {runQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading run…
              </div>
            ) : run ? (
              <>
                {runEnvironmentMetadataItems.length > 0 ? (
                  <DetailSection title="Environment" accentBorder="sky">
                    <MetadataGrid columns={2} items={runEnvironmentMetadataItems} />
                  </DetailSection>
                ) : null}

                {readinessQuery.isSuccess && gateResults.length > 0 ? (
                  <DetailSection
                    title="Readiness gates"
                    accentBorder="sky"
                  >
                    <DataTable
                      tableId={`run-readiness:${runId}`}
                      title="Readiness gates"
                      columns={gateColumns}
                      data={gateResults}
                      keyExtractor={(r) => r.id}
                    />
                  </DetailSection>
                ) : null}
              </>
            ) : null}
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="graph" className={tabPanelScrollClassName()}>
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.graph}>
            <DetailSection accentBorder="sky">
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

        <TabsContent value="tasks" className={tabPanelScrollClassName()}>
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.tasks}>
            <DetailSection>
              {tasksQuery.isError ? (
                <p className="text-sm text-red-300">{formatApiClientError(tasksQuery.error)}</p>
              ) : (
                <RunTasksUsageTable
                  tasks={tasks}
                  usageByTaskId={usageByTaskId}
                  liveByTaskId={liveByTaskId}
                  tenantId={run?.tenant_id ?? tenantId}
                  projectId={run?.project_id ?? projectId}
                  runId={runId}
                  usageEnabled={usageQuery.data?.enabled ?? true}
                  usageLoading={usageQuery.isLoading}
                  runUsage={usageQuery.data?.usage ?? null}
                  runTimelineTaskId={runTimelineTaskId}
                  onRunTimelineTaskChange={setRunTimelineTaskId}
                  runSamples={runUsageSamplesQuery.data?.samples ?? []}
                  runSamplesLoading={runUsageSamplesQuery.isLoading}
                  expandedTaskId={expandedTaskId}
                  onToggleTask={toggleExpandedTask}
                  samples={usageSamplesQuery.data?.samples ?? []}
                  samplesLoading={usageSamplesQuery.isLoading}
                  samplesEnabled={
                    runUsageSamplesQuery.data?.enabled ?? usageQuery.data?.enabled ?? true
                  }
                />
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="logs" className={tabPanelScrollClassName()}>
          <RunTabPanel loading={isTabLoading && logsQuery.isLoading} variant={RUN_TAB_SKELETON.logs}>
            <DetailSection bodyClassName="p-0">
              <ExecutionLogToolbar
                search={logSearch}
                onSearchChange={setLogSearch}
                liveStatus={logsQuery.liveStatus}
                isFetching={logsQuery.isRefetching}
                onExport={handleLogExport}
                exporting={logExporting}
                extra={
                  logTaskOptions.length > 0 ? (
                    <Select value={logTaskFilter} onValueChange={setLogTaskFilter}>
                      <SelectTrigger className="h-8 w-[min(280px,55vw)] font-mono text-xs">
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
                  ) : null
                }
              />
              <div className="min-w-0">
                {logsQuery.isError ? (
                  <p className="text-sm text-destructive">{formatApiClientError(logsQuery.error)}</p>
                ) : (
                  <ExecutionLogStream
                    items={displayedLogs}
                    isLoading={logsQuery.isLoading}
                    hasMoreOlder={Boolean(logsQuery.hasNextPage)}
                    isLoadingOlder={logsQuery.isFetchingNextPage}
                    onLoadOlder={() => void logsQuery.fetchNextPage()}
                    emptyMessage={
                      logTaskFilter === "all" ? "No log lines yet." : "No log lines for this task."
                    }
                    className="max-h-[min(520px,55vh)] space-y-1"
                    renderLine={(log, index) => (
                      <LogLineRow
                        key={`${log.sequence ?? log.ts}-${log.payload?.task_id ?? ""}-${index}`}
                        log={log}
                      />
                    )}
                  />
                )}
              </div>
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="metrics" className={tabPanelScrollClassName()}>
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.metrics}>
            <DetailSection>
              <RunMetricsSummary
                tracking={trackingQuery.data}
                exporting={exportingMetrics}
                onExport={handleExportMetrics}
              />
              {trackingQuery.isError ? (
                <p className="text-sm text-muted-foreground">{formatApiClientError(trackingQuery.error)}</p>
              ) : (trackingQuery.data?.metrics ?? []).length > 0 ? (
                <RunMetricsCharts
                  metrics={trackingQuery.data?.metrics ?? []}
                  tenantId={tenantId}
                  projectId={projectId}
                  runId={runId}
                />
              ) : (
                <MlopsEmptyState
                  icon={BarChart3}
                  title="No metrics"
                />
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>

        <TabsContent value="artifacts" className={tabPanelScrollClassName()}>
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.artifacts}>
            <DetailSection>
              {trackingQuery.isError ? (
                <p className="text-sm text-muted-foreground">{formatApiClientError(trackingQuery.error)}</p>
              ) : (trackingQuery.data?.artifacts ?? []).length === 0 ? (
                <MlopsEmptyState
                  icon={FileBox}
                  title="No artifacts"
                />
              ) : (
                <ul className="space-y-2">
                  {(trackingQuery.data?.artifacts ?? []).map((a) => (
                    <li key={a.artifact_id}>
                      {a.uri ? (
                        <a
                          href={a.uri}
                          className="group inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 hover:underline"
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

        <TabsContent value="timeline" className={tabPanelScrollClassName()}>
          <RunTabPanel loading={isTabLoading} variant={RUN_TAB_SKELETON.timeline}>
            <DetailSection>
              {timelineQuery.isError ? (
                <p className="text-sm text-red-300">{formatApiClientError(timelineQuery.error)}</p>
              ) : timelineEvents.length === 0 ? (
                <MlopsEmptyState
                  icon={Clock}
                  title="No timeline events"
                />
              ) : (
                <>
                  <AuditTimeline events={timelineEvents} />
                  {timelineQuery.hasNextPage ? (
                    <div className="flex justify-center border-t border-border/60 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={timelineQuery.isFetchingNextPage}
                        onClick={() => void timelineQuery.fetchNextPage?.()}
                      >
                        {timelineQuery.isFetchingNextPage ? "Loading…" : "Load more events"}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </DetailSection>
          </RunTabPanel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
