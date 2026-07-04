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
import type {
  RunUsageRecord,
  TaskItem,
  TaskUsageRecord,
  UsageSamplePoint,
  UsageSampleStats,
} from "@/lib/api"
import { formatMemMb, formatPct, taskUsageLabel } from "@/lib/usage-format"
import { useChartTheme } from "@/hooks/use-chart-theme"
import { grafanaDashboardUrl } from "@/lib/grafana-dashboard-url"

const CHART_COLORS = {
  cpu: "#38bdf8",
  memory: "#a78bfa",
  gpu: "#34d399",
  power: "#f97316",
  temp: "#fb7185",
} as const

function buildChartSeries(samples: UsageSamplePoint[], mergeAllTasks = false) {
  if (!samples.length) return []

  if (!mergeAllTasks) {
    const t0 = new Date(samples[0].sampled_at).getTime()
    return samples.map((s) => {
      const elapsed = Math.max(0, Math.round((new Date(s.sampled_at).getTime() - t0) / 1000))
      return pointToChart(elapsed, s)
    })
  }

  const t0 = Math.min(...samples.map((s) => new Date(s.sampled_at).getTime()))
  const buckets = new Map<number, ReturnType<typeof pointToChart>>()
  for (const s of samples) {
    const elapsed = Math.max(0, Math.round((new Date(s.sampled_at).getTime() - t0) / 1000))
    const prev = buckets.get(elapsed)
    const next = pointToChart(elapsed, s)
    if (!prev) {
      buckets.set(elapsed, next)
      continue
    }
    buckets.set(elapsed, {
      elapsed,
      cpu: maxDefined(prev.cpu, next.cpu),
      memory: maxDefined(prev.memory, next.memory),
      gpu: maxDefined(prev.gpu, next.gpu),
      power: maxDefined(prev.power, next.power),
      temp: maxDefined(prev.temp, next.temp),
    })
  }
  return [...buckets.values()].sort((a, b) => a.elapsed - b.elapsed)
}

function maxDefined(a?: number, b?: number) {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

function pointToChart(elapsed: number, s: UsageSamplePoint) {
  return {
    elapsed,
    cpu: s.cpu_percent ?? undefined,
    memory: s.memory_mb ?? undefined,
    gpu: s.gpu_util_percent ?? undefined,
    power: s.gpu_power_w ?? undefined,
    temp: s.gpu_temp_c ?? undefined,
  }
}

function hasGpuSeries(samples: UsageSamplePoint[]) {
  return samples.some((s) => s.gpu_util_percent != null || s.gpu_memory_mb != null)
}

function hasPowerSeries(samples: UsageSamplePoint[]) {
  return samples.some((s) => s.gpu_power_w != null || s.gpu_temp_c != null)
}

export function RunResourceTimeline({
  tasks,
  samples,
  usageByTaskId,
  runUsage,
  selectedTaskId,
  onTaskChange,
  loading,
  enabled,
  grafanaUiUrl,
  embedded = false,
}: {
  tasks: TaskItem[]
  samples: UsageSamplePoint[]
  usageByTaskId: Map<string, TaskUsageRecord>
  runUsage: RunUsageRecord | null
  selectedTaskId: string
  onTaskChange: (taskId: string) => void
  loading: boolean
  enabled: boolean
  grafanaUiUrl: string | null
  embedded?: boolean
}) {
  const chartTheme = useChartTheme()
  const isAll = selectedTaskId === "all"
  const chartData = useMemo(
    () => buildChartSeries(samples, isAll),
    [samples, isAll],
  )
  const showGpu = useMemo(() => hasGpuSeries(samples), [samples])
  const showPower = useMemo(() => hasPowerSeries(samples), [samples])

  const peakUsage: UsageSampleStats | undefined = isAll
    ? runUsage ?? undefined
    : usageByTaskId.get(selectedTaskId)

  const grafanaHref = grafanaDashboardUrl(grafanaUiUrl, "mlair-overview.json")

  const peakItems = [
    { label: "CPU peak", value: formatPct(peakUsage?.cpu_pct_peak ?? null), mono: true },
    { label: "CPU P95", value: formatPct(peakUsage?.cpu_pct_p95 ?? null), mono: true },
    { label: "CPU avg", value: formatPct(peakUsage?.cpu_pct_avg ?? null), mono: true },
    { label: "Memory peak", value: formatMemMb(peakUsage?.memory_mb_peak ?? null), mono: true },
    { label: "GPU peak", value: formatPct(peakUsage?.gpu_util_pct_peak ?? null), mono: true },
    { label: "GPU power peak", value: peakUsage?.gpu_power_w_peak != null ? `${peakUsage.gpu_power_w_peak.toFixed(0)} W` : "—", mono: true },
    { label: "GPU temp peak", value: peakUsage?.gpu_temp_c_peak != null ? `${peakUsage.gpu_temp_c_peak.toFixed(0)} °C` : "—", mono: true },
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
      {embedded ? null : (
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
      )}

      {peakUsage || samples.length > 0 ? (
        <MetadataGrid columns={4} items={peakItems} />
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
                  if (name === "memory") return [formatMemMb(value), name]
                  if (name === "cpu" || name === "gpu") return [formatPct(value), name]
                  if (name === "power") return [`${value.toFixed(0)} W`, name]
                  if (name === "temp") return [`${value.toFixed(0)} °C`, name]
                  return [value, name]
                }}
                labelFormatter={(v) => `t+${v}s`}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="cpu" name="CPU %" stroke={CHART_COLORS.cpu} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="memory" name="Memory MB" stroke={CHART_COLORS.memory} dot={false} strokeWidth={2} isAnimationActive={false} />
              {showGpu ? (
                <Line yAxisId="left" type="monotone" dataKey="gpu" name="GPU %" stroke={CHART_COLORS.gpu} dot={false} strokeWidth={2} isAnimationActive={false} />
              ) : null}
              {showPower ? (
                <>
                  <Line yAxisId="left" type="monotone" dataKey="power" name="GPU power W" stroke={CHART_COLORS.power} dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="temp" name="GPU temp °C" stroke={CHART_COLORS.temp} dot={false} strokeWidth={2} isAnimationActive={false} />
                </>
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
