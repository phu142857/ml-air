"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { TaskItem, TaskLiveUsage, TaskUsageRecord } from "@/lib/api"
import { buildTaskDetailHref } from "@/lib/task-detail-href"
import { StatusBadge } from "@/components/mlops/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatMemMb,
  formatPct,
  formatRuntimeSeconds,
  taskUsageLabel,
} from "@/lib/usage-format"
import { statusToMlopsBadge } from "@/lib/status-style"
import { cn } from "@/lib/utils"

const ELAPSED_TICK_MS = 1000

type RunTasksUsageTableProps = {
  tasks: TaskItem[]
  usageByTaskId: Map<string, TaskUsageRecord>
  liveByTaskId: Map<string, TaskLiveUsage>
  tenantId: string
  projectId: string
  runId: string
  usageEnabled?: boolean
  usageLoading?: boolean
}

const TERMINAL_STATUSES = new Set([
  "SUCCESS",
  "SUCCEEDED",
  "FAILED",
  "FAILURE",
  "CANCELLED",
  "CANCELED",
])

function isTerminalStatus(status: string) {
  return TERMINAL_STATUSES.has(String(status || "").toUpperCase())
}

function terminalEndMs(task: TaskItem): number | null {
  if (task.finished_at) return new Date(task.finished_at).getTime()
  if (task.updated_at) return new Date(task.updated_at).getTime()
  return null
}

function taskElapsedSeconds(
  task: TaskItem,
  usage: TaskUsageRecord | undefined,
  live: TaskLiveUsage | undefined,
  nowMs: number,
): number | null {
  const status = String(task.status || "").toUpperCase()

  if (isTerminalStatus(status)) {
    if (live?.runtime_seconds != null) return live.runtime_seconds
    if (usage?.runtime_seconds != null) return usage.runtime_seconds
    if (task.duration_ms != null && task.duration_ms > 0) return task.duration_ms / 1000
    if (task.started_at) {
      const endMs = terminalEndMs(task)
      if (endMs != null) {
        return Math.max(0, (endMs - new Date(task.started_at).getTime()) / 1000)
      }
    }
    return null
  }

  if (status === "RUNNING") {
    if (task.started_at) {
      return Math.max(0, (nowMs - new Date(task.started_at).getTime()) / 1000)
    }
    if (live?.runtime_seconds != null) return live.runtime_seconds
  }

  return null
}

function latestMetrics(live?: TaskLiveUsage, usage?: TaskUsageRecord) {
  return {
    cpu: live?.cpu_percent ?? usage?.cpu_pct_peak ?? null,
    memory: live?.memory_mb ?? usage?.memory_mb_peak ?? null,
    gpu: live?.gpu_util_percent ?? usage?.gpu_util_pct_peak ?? null,
  }
}

function metricCell(value: string, live = false) {
  return (
    <span className={cn("text-xs tabular-nums", live ? "text-foreground" : "text-foreground/90")}>
      {value}
    </span>
  )
}

export function RunTasksUsageTable({
  tasks,
  usageByTaskId,
  liveByTaskId,
  tenantId,
  projectId,
  runId,
  usageEnabled = true,
  usageLoading = false,
}: RunTasksUsageTableProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  const rows = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return ta - tb
      }),
    [tasks],
  )

  const hasRunningTask = useMemo(
    () => rows.some((task) => String(task.status || "").toUpperCase() === "RUNNING"),
    [rows],
  )

  useEffect(() => {
    if (!hasRunningTask) return
    const id = window.setInterval(() => setNowMs(Date.now()), ELAPSED_TICK_MS)
    return () => window.clearInterval(id)
  }, [hasRunningTask])

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No tasks returned for this run.</p>
  }

  return (
    <div className="space-y-3">
      {!usageEnabled ? (
        <p className="text-xs text-muted-foreground">Usage tracking is disabled on the platform.</p>
      ) : usageLoading ? (
        <p className="text-xs text-muted-foreground">Loading resource usage…</p>
      ) : null}
      <div className="bezel-shell overflow-hidden">
        <div className="bezel-inner overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Task
                </TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Elapsed
                </TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  CPU
                </TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  RAM
                </TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  GPU
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((task) => {
                const usage = usageByTaskId.get(task.task_id)
                const live = liveByTaskId.get(task.task_id)
                const metrics = latestMetrics(live, usage)
                const label = taskUsageLabel(task.task_id, usage?.plugin)
                const statusUpper = String(task.status || "").toUpperCase()
                const isRunning = statusUpper === "RUNNING"
                const elapsed = formatRuntimeSeconds(taskElapsedSeconds(task, usage, live, nowMs))
                const taskHref = buildTaskDetailHref(task.task_id, {
                  tenant_id: tenantId,
                  project_id: projectId,
                  run_id: runId,
                })

                return (
                  <TableRow key={task.task_id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="min-w-[140px] py-2">
                      <div className="min-w-0">
                        <Link
                          href={taskHref}
                          className="truncate text-xs font-medium text-primary hover:text-primary/80"
                        >
                          {label}
                        </Link>
                        {usage?.plugin ? (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{task.task_id}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={statusToMlopsBadge(task.status)} label={task.status} size="sm" />
                    </TableCell>
                    <TableCell className="py-2">{metricCell(elapsed, isRunning)}</TableCell>
                    <TableCell className="py-2">{metricCell(formatPct(metrics.cpu), isRunning)}</TableCell>
                    <TableCell className="py-2">{metricCell(formatMemMb(metrics.memory), isRunning)}</TableCell>
                    <TableCell className="py-2">{metricCell(formatPct(metrics.gpu), isRunning)}</TableCell>
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
