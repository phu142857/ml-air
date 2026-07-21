"use client"

import { useMemo, useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { taskIdPathSegment } from "@/lib/api"
import { ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/mlops/data-table"
import { StatusBadge } from "@/components/mlops/status-badge"
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout"
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

  const { items: rows, runsQuery, isLoading, isError, error, isFetching } = useTasksListLive(
    Boolean(token?.trim()),
  )

  const taskColumns: DataTableColumn<TaskRow>[] = useMemo(
    () => [
      {
        id: "task_id",
        header: "Task ID",
        width: 260,
        canHide: false,
        getSearchValue: (row) => `${row.task_id} ${row.tenant_id} ${row.project_id}`,
        getSortValue: (row) => row.task_id,
        cell: (row) => (
          <Link
            href={buildTaskDetailHref(row.task_id, {
              tenant_id: row.tenant_id,
              project_id: row.project_id,
              run_id: row.run_id,
            })}
            className="font-mono text-sm text-primary hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
          >
            {row.task_id}
          </Link>
        ),
      },
      {
        id: "run_id",
        header: "Run",
        width: 220,
        getSearchValue: (row) => row.run_id,
        getSortValue: (row) => row.run_id,
        cell: (row) => (
          <Link
            href={`/runs/${encodeURIComponent(row.run_id)}`}
            className="font-mono text-xs text-primary hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
          >
            {row.run_id}
          </Link>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        getSortValue: (row) => normalizeStatus(row.status),
        getFilterValue: (row) => normalizeStatus(row.status),
        filterOptions: [
          { label: "Pending", value: "PENDING" },
          { label: "Running", value: "RUNNING" },
          { label: "Success", value: "SUCCESS" },
          { label: "Failed", value: "FAILED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
        cell: (row) => (
          <StatusBadge status={statusToMlopsBadge(row.status)} label={normalizeStatus(row.status)} size="sm" />
        ),
      },
      {
        id: "attempt",
        header: "Attempt",
        width: 110,
        getSortValue: (row) => row.attempt,
        cell: (row) => <span className="text-sm tabular-nums text-foreground/90">{row.attempt}</span>,
      },
      {
        id: "updated",
        header: "Updated",
        width: 150,
        getSortValue: (row) => row.updated_at,
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
      <ResourcePageHeader className="shrink-0" icon={ListTodo} accent="violet" title="Tasks" />

      <PageScrollBody variant="workspace">
        <ScopedListContent
          isLoading={isLoading}
          isError={isError}
          errorMessage={queryError ? formatApiClientError(queryError) : undefined}
          isEmpty={rows.length === 0}
          emptyIcon={ListTodo}
          emptyTitle="No tasks"
          emptyDescription=""
          skeletonRows={5}
        >
          <DataTable
            className="min-h-0 flex-1"
            tableId="tasks-recent"
            columns={taskColumns}
            data={rows}
            keyExtractor={(row) => `${row.tenant_id}:${row.project_id}:${row.task_id}`}
            onRowClick={openTask}
            emptyMessage="No tasks."
            loading={isFetching && rows.length > 0}
            stickyFirstColumn
          />
        </ScopedListContent>
      </PageScrollBody>
    </div>
  )
}
