"use client"

import { useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { StatusBadge } from "@/components/mlops/status-badge"
import { ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
import { ScopedListContent } from "@/components/mlops/scoped-list-content"
import { SCOPE_AGGREGATE_TASKS } from "@/lib/scope-messages"
import { useTasksListLive, type TaskRow } from "@/hooks/use-tasks-list-live"
import { isScopePinned } from "@/lib/scope"
import { buildTaskDetailHref } from "@/lib/task-detail-href"
import { formatApiClientError, formatRelativeTime } from "@/lib/utils"
import { normalizeStatus, statusToMlopsBadge } from "@/lib/status-style"
import { useAppContext } from "@/lib/app-context"

export default function TasksPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const isAggregate = !scopePinned
  const [taskId, setTaskId] = useState("")

  const { items: rows, recentRuns, runsQuery, isLoading, isError, error, isFetching } = useTasksListLive(
    Boolean(token?.trim()),
  )

  const taskColumns: DataTableColumn<TaskRow>[] = useMemo(
    () => [
      {
        id: "task_id",
        header: "Task ID",
        cell: (row) => (
          <Link
            href={buildTaskDetailHref(row.task_id, {
              tenant_id: row.tenant_id,
              project_id: row.project_id,
              run_id: row.run_id,
            })}
            className="font-mono text-sm text-sky-400 hover:text-sky-300"
            onClick={(e) => e.stopPropagation()}
          >
            {row.task_id}
          </Link>
        ),
      },
      {
        id: "run_id",
        header: "Run",
        cell: (row) => (
          <Link
            href={`/runs/${encodeURIComponent(row.run_id)}`}
            className="font-mono text-xs text-sky-400 hover:text-sky-300"
            onClick={(e) => e.stopPropagation()}
          >
            {row.run_id}
          </Link>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <StatusBadge status={statusToMlopsBadge(row.status)} label={normalizeStatus(row.status)} size="sm" />
        ),
      },
      {
        id: "attempt",
        header: "Attempt",
        cell: (row) => <span className="text-sm tabular-nums text-foreground/90">{row.attempt}</span>,
      },
      {
        id: "updated",
        header: "Updated",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(row.updated_at)}</span>
        ),
      },
    ],
    [],
  )

  const openTask = useCallback(
    (row: TaskRow) => {
      router.push(
        buildTaskDetailHref(row.task_id, {
          tenant_id: row.tenant_id,
          project_id: row.project_id,
          run_id: row.run_id,
        }),
      )
    },
    [router],
  )

  const queryError = runsQuery.error ?? error

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={ListTodo}
        accent="violet"
        title="Tasks"
        subtitle={
          isAggregate
            ? "Fan-out across workspaces — pin scope to filter"
            : isFetching
              ? "Live updates from runs and task events"
              : "Attempts, payloads, and worker metadata"
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-6">
        {isAggregate ? <ScopePinnedInline message={SCOPE_AGGREGATE_TASKS} /> : null}
        <div className="max-w-xl shrink-0 rounded-lg border border-border bg-card/80 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-foreground">Open by task id</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Jump straight to a task detail URL.</p>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const id = taskId.trim()
              if (!id) return
              router.push(`/tasks/${encodeURIComponent(id)}`)
            }}
          >
            <Input
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              placeholder="task_id"
              className="h-9 max-w-xs border-border bg-background font-mono text-sm"
              aria-label="Task id"
            />
            <Button type="submit" className="h-9 bg-violet-600 text-white hover:bg-violet-500" disabled={!taskId.trim()}>
              Open task
            </Button>
          </form>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="shrink-0">
            <h3 className="text-sm font-medium text-foreground">Recent tasks</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              From {recentRuns.length} recent run{recentRuns.length === 1 ? "" : "s"}
              {isAggregate ? " (aggregate scope)" : ""}
              {isFetching ? " · syncing…" : ""}.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <ScopedListContent
              isLoading={isLoading}
              isError={isError}
              errorMessage={queryError ? formatApiClientError(queryError) : undefined}
              isEmpty={rows.length === 0}
              emptyIcon={ListTodo}
              emptyTitle="No tasks in recent runs"
              emptyDescription="Trigger a run or open a task by id above."
              skeletonRows={5}
            >
              <DataTable
                columns={taskColumns}
                data={rows}
                keyExtractor={(row) => `${row.tenant_id}:${row.project_id}:${row.task_id}`}
                onRowClick={openTask}
                emptyMessage="No tasks in recent runs."
              />
            </ScopedListContent>
          </div>
        </div>
      </div>
    </div>
  )
}

