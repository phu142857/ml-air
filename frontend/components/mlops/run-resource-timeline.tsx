"use client"

import { useMemo } from "react"
import Link from "next/link"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ExternalLink, Activity, Cpu } from "lucide-react"

import { MetadataGrid, MlopsEmptyState } from "@/components/mlops/layout"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TaskItem, TaskUsageRecord, UsageSamplePoint } from "@/lib/api"
import { formatMemMb, formatPct, taskUsageLabel } from "@/lib/usage-format"
import { useChartTheme } from "@/hooks/use-chart-theme"
import { grafanaDashboardUrl } from "@/lib/grafana-dashboard-url"

const CHART_COLORS = {
  cpu: "#38bdf8",
  memory: "#a78bfa",
  gpu: "#34d399",
  gpuMem: "#fbbf24",
} as const

function buildChartSeries(samples: UsageSamplePoint[]) {
  if (!samples.length) return []
  const t0 = new Date(samples[0].sampled_at).getTime()
  return samples.map((s) => {
    const elapsed = Math.max(0, Math.round((new Date(s.sampled_at).getTime() - t0) / 1000))
    return {
      elapsed,
      cpu: s.cpu_percent ?? undefined,
      memory: s.memory_mb ?? undefined,
      gpu: s.gpu_util_percent ?? undefined,
      gpuMem: s.gpu_memory_mb ?? undefined,
    }
  })
}

function hasGpuSeries(samples: UsageSamplePoint[]) {
  return samples.some((s) => s.gpu_util_percent != null || s.gpu_memory_mb != null)
}

export function RunResourceTimeline({
  tasks,
  samples,
  usageByTaskId,
  selectedTaskId,
  onTaskChange,
  loading,
  enabled,
  grafanaUiUrl,
}: {
  tasks: TaskItem[]
  samples: UsageSamplePoint[]
  usageByTaskId: Map<string, TaskUsageRecord>
  selectedTaskId: string
  onTaskChange: (taskId: string) => void
  loading: boolean
  enabled: boolean
  grafanaUiUrl: string | null
}) {
  const chartTheme = useChartTheme()
  const chartData = useMemo(() => buildChartSeries(samples), [samples])
  const showGpu = useMemo(() => hasGpuSeries(samples), [samples])

  const peakTaskId =
    selectedTaskId !== "all" ? selectedTaskId : (tasks[0]?.task_id ?? "")
  const peakUsage = peakTaskId ? usageByTaskId.get(peakTaskId) : undefined

  const grafanaHref = grafanaDashboardUrl(grafanaUiUrl, "mlair-overview.json")

  const peakItems = [
    { label: "CPU peak", value: formatPct(peakUsage?.cpu_pct_peak ?? null), mono: true },
    { label: "Memory peak", value: formatMemMb(peakUsage?.memory_mb_peak ?? null), mono: true },
    { label: "GPU peak", value: formatPct(peakUsage?.gpu_util_pct_peak ?? null), mono: true },
    {
      label: "GPU memory peak",
      value: formatMemMb(peakUsage?.gpu_memory_mb_peak ?? null),
      mono: true,
    },
    {
      label: "Samples",
      value: peakUsage?.sample_count != null ? String(peakUsage.sample_count) : String(samples.length),
      mono: true,
    },
  ]

  if (!enabled) {
    return (
      <MlopsEmptyState
        icon={Activity}
        title="Usage tracking disabled"
        description="Set ML_AIR_USAGE_TRACKING_ENABLED=1 on API and executor to capture resource timelines."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Task</span>
          <Select value={selectedTaskId} onValueChange={onTaskChange}>
            <SelectTrigger className="h-8 w-[min(360px,80vw)] font-mono text-xs">
              <SelectValue placeholder="All tasks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tasks (merged timeline)</SelectItem>
              {tasks.map((t) => (
                <SelectItem key={t.task_id} value={t.task_id} className="font-mono text-xs">
                  {taskUsageLabel(t.task_id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {grafanaHref ? (
          <Button asChild size="sm" variant="outline" className="border-border bg-card">
            <Link href={grafanaHref} target="_blank" rel="noopener noreferrer">
              Open in Grafana
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>

      {peakUsage || samples.length > 0 ? (
        <MetadataGrid columns={3} items={peakItems} />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading resource samples…</p>
      ) : chartData.length === 0 ? (
        <MlopsEmptyState
          icon={Cpu}
          title="No resource samples yet"
          description="Samples appear while tasks run (heartbeat flush) and after task complete. Run a training job for 10+ seconds to populate the chart."
        />
      ) : (
        <div className="h-[min(360px,45vh)] w-full rounded-lg border border-border/70 bg-card/40 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
              <XAxis
                dataKey="elapsed"
                stroke={chartTheme.axisStroke}
                tick={{ fontSize: 11 }}
                label={{ value: "Elapsed (s)", position: "insideBottom", offset: -2, fontSize: 11 }}
              />
              <YAxis yAxisId="left" stroke={chartTheme.axisStroke} tick={{ fontSize: 11 }} width={40} />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={chartTheme.axisStroke}
                tick={{ fontSize: 11 }}
                width={44}
              />
              <Tooltip
                contentStyle={{ ...chartTheme.tooltipStyle, borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  if (name === "memory" || name === "gpuMem") return [formatMemMb(value), name]
                  if (name === "cpu" || name === "gpu") return [formatPct(value), name]
                  return [value, name]
                }}
                labelFormatter={(v) => `t+${v}s`}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cpu"
                name="CPU %"
                stroke={CHART_COLORS.cpu}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="memory"
                name="Memory MB"
                stroke={CHART_COLORS.memory}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {showGpu ? (
                <>
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="gpu"
                    name="GPU %"
                    stroke={CHART_COLORS.gpu}
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="gpuMem"
                    name="GPU mem MB"
                    stroke={CHART_COLORS.gpuMem}
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </>
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
