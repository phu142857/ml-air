"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ListTodo, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ResourcePageHeader } from "@/components/layout/page-chrome"
import { ScopePinnedInline } from "@/components/mlops/scope-pinned-banner"
import { useAppContext } from "@/lib/app-context"
import { fetchRunTasks, fetchRuns, type TaskItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { isScopePinned } from "@/lib/scope"
import { buildTaskDetailHref } from "@/lib/task-detail-href"
import { cn, formatApiClientError, formatRelativeTime } from "@/lib/utils"
import { normalizeStatus, statusBadgeClass } from "@/lib/status-style"

type TaskRow = TaskItem & { run_id: string; tenant_id: string; project_id: string }

export default function TasksPage() {
  const router = useRouter()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = isScopePinned(tenantId, projectId)
  const [taskId, setTaskId] = useState("")

  const runsQuery = useQuery({
    queryKey: mlairKeys.runs.list(tenantId, projectId),
    queryFn: () => fetchRuns(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })

  const recentRuns = useMemo(() => {
    const items = runsQuery.data?.items ?? []
    return [...items]
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, scopePinned ? 8 : 5)
  }, [runsQuery.data, scopePinned])

  const recentTasksQuery = useQuery({
    queryKey: [
      "recent-tasks",
      tenantId,
      projectId,
      recentRuns.map((r) => `${r.tenant_id}:${r.project_id}:${r.run_id}`).join(","),
    ] as const,
    queryFn: async (): Promise<TaskRow[]> => {
      const batches = await Promise.all(
        recentRuns.map(async (run) => {
          const tid = run.tenant_id || tenantId
          const pid = run.project_id || projectId
          if (tid === "all" || pid === "all") return []
          try {
            const data = await fetchRunTasks(tid, pid, run.run_id, token)
            return (data.items ?? []).map((t) => ({
              ...t,
              run_id: run.run_id,
              tenant_id: tid,
              project_id: pid,
            }))
          } catch {
            return []
          }
        }),
      )
      return batches
        .flat()
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
        .slice(0, 40)
    },
    enabled: Boolean(token?.trim()) && recentRuns.length > 0,
  })

  const rows = recentTasksQuery.data ?? []

  return (
    <div className="flex h-full flex-col">
      <ResourcePageHeader
        icon={ListTodo}
        accent="violet"
        title="Tasks"
        subtitle="Open a task by id or browse tasks from recent runs"
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="max-w-xl rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Task id</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              placeholder="task_id"
              className="h-9 max-w-xs border-zinc-800 bg-zinc-950 font-mono text-sm text-zinc-100"
            />
            <Button
              className="h-9 bg-violet-600 text-white hover:bg-violet-500"
              disabled={!taskId.trim()}
              onClick={() => {
                if (!taskId.trim()) return
                router.push(`/tasks/${encodeURIComponent(taskId.trim())}`)
              }}
            >
              Open task
            </Button>
          </div>
        </div>

        {!scopePinned ? (
          <ScopePinnedInline message="Aggregate scope — recent tasks are sampled from runs across projects (each run uses its own tenant/project)." />
        ) : null}

        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-300">Recent tasks</h2>
            <p className="text-xs text-zinc-500">
              From {recentRuns.length} recent run{recentRuns.length === 1 ? "" : "s"}
              {!scopePinned ? " (aggregate scope)" : ""}
            </p>
          </div>
          {runsQuery.isLoading || recentTasksQuery.isLoading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tasks…
            </div>
          ) : runsQuery.isError ? (
            <p className="px-4 py-6 text-sm text-red-300">{formatApiClientError(runsQuery.error)}</p>
          ) : recentTasksQuery.isError ? (
            <p className="px-4 py-6 text-sm text-red-300">{formatApiClientError(recentTasksQuery.error)}</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500">No tasks in recent runs for this scope.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-500">Task</TableHead>
                  <TableHead className="text-zinc-500">Run</TableHead>
                  <TableHead className="text-zinc-500">Status</TableHead>
                  <TableHead className="text-zinc-500">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.task_id} className="border-zinc-800">
                    <TableCell>
                      <Link
                        href={buildTaskDetailHref(row.task_id, {
                          tenant_id: row.tenant_id,
                          project_id: row.project_id,
                          run_id: row.run_id,
                        })}
                        className="font-mono text-sm text-sky-400 hover:underline"
                      >
                        {row.task_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/runs/${encodeURIComponent(row.run_id)}`}
                        className="font-mono text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        {row.run_id.slice(0, 12)}…
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {normalizeStatus(row.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatRelativeTime(row.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
