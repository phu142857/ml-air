"use client"

import { Fragment, useMemo } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { TaskItem, TaskLiveUsage, TaskUsageRecord, UsageSamplePoint, RunUsageRecord } from "@/lib/api"
import { buildTaskDetailHref } from "@/lib/task-detail-href"
import { StatusBadge } from "@/components/mlops/status-badge"
import { RunResourceTimeline } from "@/components/mlops/run-resource-timeline"
import { Panel } from "@/components/ui/panel"
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
import { computeTaskElapsedSeconds, hasRunningTask } from "@/lib/task-elapsed"
import { useWallClockNow } from "@/hooks/use-wall-clock-now"
import { statusToMlopsBadge } from "@/lib/status-style"
import { cn } from "@/lib/utils"

type RunTasksUsageTableProps = {
  tasks: TaskItem[]
  usageByTaskId: Map<string, TaskUsageRecord>
  liveByTaskId: Map<string, TaskLiveUsage>
  tenantId: string
  projectId: string
  runId: string
  usageEnabled?: boolean
  usageLoading?: boolean
  runUsage?: RunUsageRecord | null
  runTimelineTaskId?: string
  onRunTimelineTaskChange?: (taskId: string) => void
  runSamples?: UsageSamplePoint[]
  runSamplesLoading?: boolean
  samplesEnabled?: boolean
  expandedTaskId: string | null
  onToggleTask: (taskId: string) => void
  samples: UsageSamplePoint[]
  samplesLoading?: boolean
}

const TABLE_COL_COUNT = 7

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
  runUsage = null,
  runTimelineTaskId = "all",
  onRunTimelineTaskChange,
  runSamples = [],
  runSamplesLoading = false,
  samplesEnabled = true,
  expandedTaskId,
  onToggleTask,
  samples,
  samplesLoading = false,
}: RunTasksUsageTableProps) {
  const rows = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return ta - tb
      }),
    [tasks],
  )

  const wallClockNowMs = useWallClockNow(hasRunningTask(rows))

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No tasks returned for this run.</p>
  }

  return (
    <div className="space-y-4">
      {!usageEnabled ? (
        <p className="text-xs text-muted-foreground">Usage tracking is disabled on the platform.</p>
      ) : usageLoading ? (
        <p className="text-xs text-muted-foreground">Loading resource usage…</p>
      ) : null}

      <Panel className="p-4">
        <RunResourceTimeline
          tasks={rows}
          samples={runSamples}
          usageByTaskId={usageByTaskId}
          runUsage={runUsage}
          selectedTaskId={runTimelineTaskId}
          onTaskChange={onRunTimelineTaskChange ?? (() => {})}
          loading={runSamplesLoading}
          enabled={samplesEnabled}
        />
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="w-8" aria-hidden />
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
                const elapsed = formatRuntimeSeconds(computeTaskElapsedSeconds(task, wallClockNowMs))
                const taskHref = buildTaskDetailHref(task.task_id, {
                  tenant_id: tenantId,
                  project_id: projectId,
                  run_id: runId,
                })
                const isExpanded = expandedTaskId === task.task_id

                return (
                  <Fragment key={task.task_id}>
                    <TableRow
                      className={cn(
                        "interactive-row group cursor-pointer border-border/50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                        "hover:bg-muted/40 active:bg-muted/55",
                        isExpanded && "bg-muted/40",
                      )}
                      onClick={() => onToggleTask(task.task_id)}
                      aria-expanded={isExpanded}
                    >
                      <TableCell className="py-2 pr-0">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            isExpanded && "rotate-90",
                          )}
                        />
                      </TableCell>
                      <TableCell className="min-w-[140px] py-2">
                        <div className="min-w-0">
                          <Link
                            href={taskHref}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-xs font-medium link-primary"
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
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell colSpan={TABLE_COL_COUNT} className="p-0">
                        <div
                          className="grid transition-[grid-template-rows] duration-300 ease-out"
                          style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-border/50 bg-muted/20 px-3 py-4">
                              {isExpanded ? (
                                <RunResourceTimeline
                                  tasks={[]}
                                  samples={samples}
                                  usageByTaskId={usageByTaskId}
                                  runUsage={null}
                                  selectedTaskId={task.task_id}
                                  onTaskChange={() => {}}
                                  loading={samplesLoading}
                                  enabled={samplesEnabled}
                                  embedded
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  )
}
