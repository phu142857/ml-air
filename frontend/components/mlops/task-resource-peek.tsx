"use client"

import type { TaskUsageRecord } from "@/lib/api"
import {
  formatBytes,
  formatMemMb,
  formatMemoryUsage,
  formatPct,
  formatRuntimeSeconds,
} from "@/lib/usage-format"

type TaskResourcePeekProps = {
  usage: TaskUsageRecord
  compact?: boolean
}

export function TaskResourcePeek({ usage, compact = false }: TaskResourcePeekProps) {
  const items = compact
    ? [
        { label: "Duration", value: formatRuntimeSeconds(usage.runtime_seconds) },
        { label: "CPU peak", value: formatPct(usage.cpu_pct_peak) },
        {
          label: "RAM peak",
          value: formatMemoryUsage(null, usage.memory_mb_peak, usage.memory_rss_peak_kb),
        },
        { label: "GPU peak", value: formatPct(usage.gpu_util_pct_peak) },
      ]
    : [
        { label: "Duration", value: formatRuntimeSeconds(usage.runtime_seconds) },
        { label: "CPU time", value: formatRuntimeSeconds(usage.cpu_seconds) },
        { label: "CPU peak", value: formatPct(usage.cpu_pct_peak) },
        {
          label: "RAM peak",
          value: formatMemoryUsage(usage.memory_mb_avg, usage.memory_mb_peak, usage.memory_rss_peak_kb),
        },
        { label: "GPU time", value: formatRuntimeSeconds(usage.gpu_seconds) },
        { label: "GPU peak", value: formatPct(usage.gpu_util_pct_peak) },
        {
          label: "GPU memory peak",
          value: usage.gpu_memory_mb_peak != null ? formatMemMb(usage.gpu_memory_mb_peak) : "—",
        },
        { label: "Disk read", value: formatBytes(usage.disk_read_bytes) },
        { label: "Disk write", value: formatBytes(usage.disk_write_bytes) },
      ]

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-xs tabular-nums text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
