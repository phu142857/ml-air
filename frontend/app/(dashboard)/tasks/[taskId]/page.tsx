"use client"

import { Suspense, useMemo } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ListTodo, Loader2, Terminal } from "lucide-react"
import { fetchTaskResolved, fetchTaskUsage, normalizeProjectId, type LogItem, type ResolvedTask } from "@/lib/api"
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
import { TaskUsageSummary } from "@/components/mlops/task-usage-summary"
import { JsonPayloadPanel } from "@/components/mlops/json-payload-panel"
import { StatusBadge } from "@/components/mlops/status-badge"
import { parseTaskScopeHint, taskScopeHintKey } from "@/lib/task-detail-href"
import { cn, formatApiClientError, formatDateTimeCompact } from "@/lib/utils"
import { isScopePinned } from "@/lib/scope"
import { isActiveExecutionStatus, statusToMlopsBadge } from "@/lib/status-style"

const ACTIVE_TASK_REFETCH_MS = 4000

function TaskLogLine({ log }: { log: LogItem }) {
  return (
    <div className="flex gap-3">
      <span className="w-[84px] shrink-0 tabular-nums text-muted-foreground/80">
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
      <span className="min-w-0 break-words text-foreground/90">{log.message}</span>
    </div>
  )
}

function taskPayloadRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {}
  return data as Record<string, unknown>
}

function TaskDetailContent() {
  const router = useRouter()
  const params = useParams<{ taskId: string }>()
  const searchParams = useSearchParams()
  const taskId = params.taskId
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
    refetchInterval: (q) => {
      const status = q.state.data?.status ?? storeTask?.status
      if (isActiveExecutionStatus(status)) return ACTIVE_TASK_REFETCH_MS
      return poll.refetchInterval
    },
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const resolved = data?.resolved_scope
  const scopePinned = isScopePinned(tenantId, projectId)
  const runId = data?.run_id ?? hint.runId

  const storeTaskForRun = useExecutionStore((s) => {
    if (!runId) return undefined
    return s.tasksByRun[runId]?.[taskId]
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

  const usageScope = useMemo(() => {
    if (resolved?.tenant_id && resolved?.project_id) {
      return { tenantId: resolved.tenant_id, projectId: resolved.project_id }
    }
    if (data?.tenant_id && data?.project_id) {
      return { tenantId: data.tenant_id, projectId: data.project_id }
    }
    if (isScopePinned(tenantId, projectId)) {
      return { tenantId, projectId }
    }
    return null
  }, [resolved, data, tenantId, projectId])

  const usageQuery = useQuery({
    queryKey: usageScope
      ? mlairKeys.task.usage(usageScope.tenantId, usageScope.projectId, taskId)
      : ["task-usage", "pending", taskId],
    queryFn: () => fetchTaskUsage(usageScope!.tenantId, usageScope!.projectId, taskId, token),
    enabled: Boolean(taskId?.trim() && token?.trim() && usageScope && task),
    refetchOnMount: "always",
    refetchInterval: () => {
      if (isActiveExecutionStatus(task?.status)) return ACTIVE_TASK_REFETCH_MS
      return poll.refetchInterval
    },
    refetchOnWindowFocus: poll.refetchOnWindowFocus,
  })

  const logsScope = usageScope
  const logsRefetchMs = isActiveExecutionStatus(task?.status) ? ACTIVE_TASK_REFETCH_MS : poll.refetchInterval
  const logsQuery = useTaskLogsInfinite(
    logsScope?.tenantId ?? "",
    logsScope?.projectId ?? "",
    taskId,
    token,
    Boolean(logsScope && task),
    typeof logsRefetchMs === "number" ? logsRefetchMs : false
  )

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
        title={`Task · ${taskId}`}
        subtitle={
          isError
            ? "Could not load task"
            : resolved
              ? scopePinned
                ? resolved.method === "fan-out"
                  ? "Resolved via cross-project fan-out"
                  : undefined
                : `${resolved.tenant_id} / ${resolved.project_id}${resolved.method === "fan-out" ? " · fan-out" : ""}`
              : isLoading
                ? "Loading task…"
                : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {runId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
                asChild
              >
                <Link href={`/runs/${encodeURIComponent(runId)}`}>View run</Link>
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
          <>
            <div className="panel-surface p-4">
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
                    value: runId ? (
                      <Link href={`/runs/${encodeURIComponent(runId)}`} className="font-mono text-xs text-primary hover:text-primary/80">
                        {runId}
                      </Link>
                    ) : (
                      "—"
                    ),
                    mono: Boolean(runId),
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
              description="CPU, memory, GPU, and disk attributed to this task (ML Resource Traceability)."
              accentBorder="violet"
              headerActions={
                runId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border bg-card text-foreground/90 hover:bg-muted hover:text-foreground"
                    asChild
                  >
                    <Link href={`/runs/${encodeURIComponent(runId)}`}>Run resources</Link>
                  </Button>
                ) : null
              }
            >
              {usageQuery.isError ? (
                <p className="text-sm text-muted-foreground">{formatApiClientError(usageQuery.error)}</p>
              ) : (
                <TaskUsageSummary
                  usage={usageQuery.data?.usage}
                  enabled={usageQuery.data?.enabled ?? true}
                  runId={usageQuery.data?.usage?.run_id ?? runId}
                  loading={usageQuery.isLoading}
                />
              )}
            </DetailSection>
            <DetailSection
              title="Task logs"
              description="Worker log lines for this task (cursor-paginated)."
              accentBorder="violet"
            >
              {!logsScope ? (
                <p className="text-sm text-muted-foreground">
                  Resolve task scope to load logs (pin tenant/project or open from a run).
                </p>
              ) : logsQuery.isError ? (
                <p className="text-sm text-destructive">{formatApiClientError(logsQuery.error)}</p>
              ) : (
                <div className="max-h-[min(420px,50vh)] space-y-1 overflow-auto rounded-md border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                  {logsQuery.isLoading && logsQuery.items.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading logs…
                    </div>
                  ) : logsQuery.items.length === 0 ? (
                    <p className="text-muted-foreground">No log lines yet.</p>
                  ) : (
                    <>
                      {logsQuery.items.map((log, index) => (
                        <TaskLogLine key={`${log.ts}-${index}`} log={log} />
                      ))}
                      {logsQuery.hasNextPage ? (
                        <div className="flex justify-center py-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 border-border bg-background/80 text-xs"
                            disabled={logsQuery.isFetchingNextPage}
                            onClick={() => void logsQuery.fetchNextPage()}
                          >
                            {logsQuery.isFetchingNextPage ? "Loading…" : "Load more logs"}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                  {logsQuery.isFetching && logsQuery.items.length > 0 ? (
                    <p className="pt-2 text-[10px] text-muted-foreground">Refreshing…</p>
                  ) : null}
                </div>
              )}
            </DetailSection>
            <JsonPayloadPanel title="Task payload" data={payload} className="border-border/60 bg-card" />
          </>
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
