"use client"

import { Suspense, useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useRealtimeQueryPolling, resolveActiveExecutionRefetchInterval } from "@/lib/realtime-query-polling"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ListTodo, Loader2 } from "lucide-react"
import {
  fetchRunUsageSamples,
  fetchTaskResolved,
  downloadRunLogsExport,
  normalizeProjectId,
  normalizeTaskId,
  type LogItem,
  type LogSearchParams,
  type ResolvedTask,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { useExecutionStore } from "@/lib/execution-store"
import { Button } from "@/components/ui/button"
import { useTaskLogsInfinite } from "@/hooks/use-task-logs-infinite"
import {
  DetailSection,
  MetadataGrid,
  MlopsEmptyState,
  PageScrollBody,
  ResourcePageHeader,
  ScopePinnedInline,
  SubpageBreadcrumb,
} from "@/components/mlops/layout"
import { RunResourceTimeline } from "@/components/mlops/run-resource-timeline"
import { ExecutionLogStream } from "@/components/mlops/execution-log-stream"
import { ExecutionLogToolbar } from "@/components/mlops/execution-log-toolbar"
import { JsonPayloadPanel } from "@/components/mlops/json-payload-panel"
import { StatusBadge } from "@/components/mlops/status-badge"
import { parseTaskScopeHint, taskScopeHintKey } from "@/lib/task-detail-href"
import { cn, formatApiClientError, formatDateTimeCompact } from "@/lib/utils"
import { toastError, toastSuccess } from "@/lib/toast-actions"
import { isScopePinned } from "@/lib/scope"
import { isActiveExecutionStatus, statusToMlopsBadge } from "@/lib/status-style"

function TaskLogLine({ log }: { log: LogItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-border/40 py-1.5 last:border-b-0 sm:flex-row sm:gap-3 sm:py-0 sm:last:border-b-0">
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="w-[5.25rem] shrink-0 tabular-nums text-muted-foreground/80">
          {log.ts ? new Date(log.ts).toLocaleTimeString() : "—"}
        </span>
        <span
          className={cn(
            "w-14 shrink-0",
            String(log.level).toUpperCase() === "INFO" && "text-primary",
            String(log.level).toUpperCase() === "WARN" && "text-[color:var(--status-pending-fg)]",
            String(log.level).toUpperCase() === "ERROR" && "text-[color:var(--status-failed-fg)]",
          )}
        >
          [{log.level}]
        </span>
      </div>
      <span className="min-w-0 break-words text-foreground/90">{log.message}</span>
    </div>
  )
}

function taskPayloadRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {}
  return data as Record<string, unknown>
}

const EMPTY_USAGE_BY_TASK = new Map<string, never>()

function TaskDetailContent() {
  const router = useRouter()
  const params = useParams<{ taskId: string }>()
  const searchParams = useSearchParams()
  const taskId = normalizeTaskId(params.taskId)
  const { tenantId, projectId, token } = useAppContext()

  const hint = useMemo(() => parseTaskScopeHint(searchParams), [searchParams])
  const scopeKey = taskScopeHintKey(hint)

  const poll = useRealtimeQueryPolling()

  const runIdHint = hint.runId
  const storeTask = useExecutionStore((s) => {
    if (!runIdHint) return undefined
    return s.tasksByRun[runIdHint]?.[taskId]
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: mlairKeys.task.detail(taskId, scopeKey),
    queryFn: () =>
      fetchTaskResolved(tenantId, projectId, taskId, token, {
        tenantId: hint.tenantId,
        projectId: hint.projectId,
        runId: hint.runId,
      }),
    enabled: Boolean(taskId?.trim() && token?.trim()),
    refetchOnMount: "always",
    refetchInterval: (q) =>
      resolveActiveExecutionRefetchInterval(poll, q.state.data?.status ?? storeTask?.status),
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const resolved = data?.resolved_scope
  const scopePinned = isScopePinned(tenantId, projectId)
  const taskRunId = data?.run_id ?? hint.runId

  /** Scope from resolved task row (matches run timeline APIs). */
  const taskApiScope = useMemo(() => {
    const tid = String(data?.tenant_id || resolved?.tenant_id || "").trim()
    const pid = normalizeProjectId(String(data?.project_id || resolved?.project_id || ""))
    if (!tid || !pid) return null
    return { tenantId: tid, projectId: pid }
  }, [data?.tenant_id, data?.project_id, resolved?.tenant_id, resolved?.project_id])

  const storeTaskForRun = useExecutionStore((s) => {
    if (!taskRunId) return undefined
    return s.tasksByRun[taskRunId]?.[taskId]
  })

  const task = useMemo((): ResolvedTask | undefined => {
    if (!data) return undefined
    const live = storeTaskForRun ?? storeTask
    if (!live) return data
    return {
      ...data,
      ...live,
      status: live.status ?? data.status,
      updated_at: live.updated_at ?? data.updated_at,
      attempt: live.attempt ?? data.attempt,
    }
  }, [data, storeTask, storeTaskForRun])
  const payload = taskPayloadRecord(data)

  const usageSamplesQuery = useQuery({
    queryKey:
      taskApiScope && taskRunId
        ? mlairKeys.task.usageSamples(taskApiScope.tenantId, taskApiScope.projectId, taskRunId, taskId)
        : ["task-usage-samples", "pending", taskId],
    queryFn: () =>
      fetchRunUsageSamples(taskApiScope!.tenantId, taskApiScope!.projectId, taskRunId!, token, {
        taskId,
        limit: 2000,
      }),
    enabled: Boolean(taskId?.trim() && token?.trim() && taskApiScope && taskRunId && task),
    refetchOnMount: "always",
    refetchInterval: () => resolveActiveExecutionRefetchInterval(poll, task?.status),
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const logsScope = taskApiScope
  const logsLive = isActiveExecutionStatus(task?.status)
  const [logSearch, setLogSearch] = useState<LogSearchParams>({})
  const [logExporting, setLogExporting] = useState(false)
  const logsRefetchMs = resolveActiveExecutionRefetchInterval(poll, task?.status)
  const logsQuery = useTaskLogsInfinite(
    logsScope?.tenantId ?? "",
    logsScope?.projectId ?? "",
    taskId,
    taskRunId,
    token,
    Boolean(logsScope && task),
    {
      streamLive: logsLive,
      refetchInterval: logsLive ? false : logsRefetchMs,
      search: logSearch,
    },
  )

  const handleLogExport = useCallback(async () => {
    if (!logsScope || !taskRunId) return
    setLogExporting(true)
    try {
      await downloadRunLogsExport(logsScope.tenantId, logsScope.projectId, taskRunId, token, {
        format: "jsonl",
        search: { ...logSearch, taskId },
      })
      toastSuccess("Export started", "Task logs download should begin shortly.")
    } catch (e) {
      toastError("Export failed", formatApiClientError(e))
    } finally {
      setLogExporting(false)
    }
  }, [logsScope, taskRunId, token, logSearch, taskId])

  if (!isLoading && !isError && !task) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SubpageBreadcrumb
          segments={[
            { label: "Tasks", href: "/tasks" },
            { label: taskId, mono: true },
          ]}
        />
        <ResourcePageHeader accent="violet" icon={ListTodo} title="Task not found" subtitle={taskId} />
        <div className="flex flex-1 items-center justify-center p-6">
          <MlopsEmptyState
            icon={ListTodo}
            title="Task not found"
            description="This task could not be resolved. Return to the list or pin tenant/project scope."
            action={
              <Button asChild size="sm" variant="outline" className="border-border bg-card">
                <Link href="/tasks">Back to tasks</Link>
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SubpageBreadcrumb
        segments={[
          { label: "Tasks", href: "/tasks" },
          { label: taskId, mono: true },
        ]}
      />
      <ResourcePageHeader
        icon={ListTodo}
        accent="violet"
        title="Task"
        subtitle={
          isError
            ? "Could not load task"
            : resolved
              ? scopePinned
                ? resolved.method === "fan-out"
                  ? "Resolved via cross-project fan-out"
                  : taskId
                : `${resolved.tenant_id} / ${resolved.project_id}${resolved.method === "fan-out" ? " · fan-out" : ""}`
              : isLoading
                ? "Loading task…"
                : taskId
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {taskRunId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
                asChild
              >
                <Link href={`/runs/${encodeURIComponent(taskRunId)}`}>View run</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
              onClick={() => router.push("/tasks")}
            >
              All tasks
            </Button>
          </div>
        }
      />
      <PageScrollBody
        header={
          <>
            {!scopePinned ? (
              <ScopePinnedInline message="Task resolution may span multiple workspaces." />
            ) : null}
            {!scopePinned && resolved?.method === "fan-out" ? (
              <p className="text-sm text-[color:var(--status-pending-fg)]/90">
                Scope was resolved automatically across projects. For faster loads next time, pin{" "}
                <span className="font-mono text-[color:var(--status-pending-fg)]">
                  {resolved.tenant_id} / {resolved.project_id}
                </span>{" "}
                in the header or use a link with{" "}
                <span className="font-mono text-[color:var(--status-pending-fg)]/80">?tenant=&amp;project=</span>.
              </p>
            ) : null}
          </>
        }
      >
        {isLoading ? (
          <div className="panel-surface p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Resolving task scope…
            </div>
          </div>
        ) : isError ? (
          <div className="panel-surface p-4">
            <div className="rounded-md border border-red-500/40 bg-[color:var(--status-failed-bg)] px-3 py-2 text-sm text-red-300">
              {formatApiClientError(error)}
            </div>
          </div>
        ) : task ? (
          <div className="flex min-w-0 w-full flex-col gap-6">
            <div className="panel-surface min-w-0 p-4">
              <h2 className="mb-4 text-sm font-medium text-foreground/90">Summary</h2>
              <MetadataGrid
                columns={2}
                items={[
                  { label: "Task ID", value: task.task_id, mono: true },
                  {
                    label: "Status",
                    value: <StatusBadge status={statusToMlopsBadge(task.status)} label={task.status} size="sm" />,
                  },
                  { label: "Attempt", value: String(task.attempt ?? "—") },
                  {
                    label: "Run",
                    value: taskRunId ? (
                      <Link href={`/runs/${encodeURIComponent(taskRunId)}`} className="font-mono text-xs text-primary hover:text-primary/80">
                        {taskRunId}
                      </Link>
                    ) : (
                      "—"
                    ),
                    mono: Boolean(taskRunId),
                  },
                  {
                    label: "Created",
                    value: task.created_at ? formatDateTimeCompact(task.created_at) : "—",
                    mono: true,
                  },
                  {
                    label: "Updated",
                    value: task.updated_at ? formatDateTimeCompact(task.updated_at) : "—",
                    mono: true,
                  },
                  ...(scopePinned &&
                  resolved &&
                  String(resolved.tenant_id || "").trim() === String(tenantId || "").trim() &&
                  normalizeProjectId(String(resolved.project_id || "")) === normalizeProjectId(String(projectId || ""))
                    ? []
                    : [
                        {
                          label: "Scope",
                          value: resolved ? `${resolved.tenant_id} / ${resolved.project_id}` : "—",
                          mono: true,
                        },
                      ]),
                ]}
              />
            </div>
            <DetailSection
              title="Resource usage"
              accentBorder="violet"
              className="min-w-0"
              bodyClassName="min-w-0"
              headerActions={
                taskRunId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
                    asChild
                  >
                    <Link href={`/runs/${encodeURIComponent(taskRunId)}`}>Run timeline</Link>
                  </Button>
                ) : null
              }
            >
              {!taskRunId ? (
                <p className="text-sm text-muted-foreground">No run linked — open this task from a run to load resource samples.</p>
              ) : usageSamplesQuery.isError ? (
                <p className="text-sm text-destructive">{formatApiClientError(usageSamplesQuery.error)}</p>
              ) : (
                <RunResourceTimeline
                  tasks={[]}
                  samples={usageSamplesQuery.data?.samples ?? []}
                  usageByTaskId={EMPTY_USAGE_BY_TASK}
                  runUsage={null}
                  selectedTaskId={taskId}
                  onTaskChange={() => {}}
                  loading={usageSamplesQuery.isLoading}
                  enabled={usageSamplesQuery.data?.enabled ?? true}
                  embedded
                />
              )}
            </DetailSection>
            <DetailSection
              title="Task logs"
              accentBorder="violet"
              className="min-w-0"
              bodyClassName="min-w-0 p-0"
            >
              {!logsScope ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  Resolve task scope to load logs (pin tenant/project or open from a run).
                </p>
              ) : logsQuery.isError ? (
                <p className="px-4 py-3 text-sm text-destructive">{formatApiClientError(logsQuery.error)}</p>
              ) : (
                <>
                  <ExecutionLogToolbar
                    search={logSearch}
                    onSearchChange={setLogSearch}
                    liveStatus={logsQuery.liveStatus}
                    isFetching={logsQuery.isFetching}
                    onExport={taskRunId ? handleLogExport : undefined}
                    exporting={logExporting}
                  />
                  <div className="min-w-0 px-1">
                    <ExecutionLogStream
                      items={logsQuery.items}
                      isLoading={logsQuery.isLoading}
                      isRefreshing={logsQuery.isFetching && !logsQuery.isFetchingNextPage && logsQuery.items.length > 0}
                      hasMoreOlder={Boolean(logsQuery.hasNextPage)}
                      isLoadingOlder={logsQuery.isFetchingNextPage}
                      onLoadOlder={() => void logsQuery.fetchNextPage()}
                      className="max-h-[min(420px,50vh)]"
                      renderLine={(log, index) => (
                        <TaskLogLine key={`${log.sequence ?? log.ts}-${index}`} log={log} />
                      )}
                    />
                  </div>
                </>
              )}
            </DetailSection>
            <JsonPayloadPanel title="Task payload" data={payload} className="min-w-0 border-border/60 bg-card" />
          </div>
        ) : null}
      </PageScrollBody>
    </div>
  )
}

export default function TaskDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading task…
        </div>
      }
    >
      <TaskDetailContent />
    </Suspense>
  )
}
