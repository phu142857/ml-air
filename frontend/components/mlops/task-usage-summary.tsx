"use client"

import { Activity } from "lucide-react"
import type { TaskUsageRecord } from "@/lib/api"
import {
  formatAvgPeak,
  formatBytes,
  formatMemoryUsage,
  formatPct,
  formatRuntimeSeconds,
} from "@/lib/usage-format"
import { MetadataGrid, MlopsEmptyState } from "@/components/mlops/layout"

type TaskUsageSummaryProps = {
  usage: TaskUsageRecord | null | undefined
  enabled?: boolean
  loading?: boolean
}

function UsageGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

export function TaskUsageSummary({ usage, enabled = true, loading }: TaskUsageSummaryProps) {
  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Loading resource metrics…</div>
    )
  }

  if (!enabled) {
    return (
      <MlopsEmptyState
        icon={Activity}
        title="Usage tracking disabled"
      />
    )
  }

  if (!usage) {
    return (
      <MlopsEmptyState
        icon={Activity}
        title="No resource usage yet"
      />
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      <UsageGroup title="Resource attribution">
        <MetadataGrid
          columns={2}
          items={[
            { label: "Runtime", value: formatRuntimeSeconds(usage.runtime_seconds) },
            { label: "CPU time", value: formatRuntimeSeconds(usage.cpu_seconds) },
            { label: "GPU time", value: formatRuntimeSeconds(usage.gpu_seconds) },
            {
              label: "GPU memory·s",
              value:
                usage.gpu_memory_mb_seconds != null && usage.gpu_memory_mb_seconds > 0
                  ? `${usage.gpu_memory_mb_seconds.toFixed(0)} MB·s`
                  : "—",
            },
          ]}
        />
      </UsageGroup>
      <UsageGroup title="Utilization (heartbeats)">
        <MetadataGrid
          columns={2}
          items={[
            {
              label: "CPU",
              value: formatAvgPeak(usage.cpu_pct_avg, usage.cpu_pct_peak, formatPct),
            },
            {
              label: "Memory",
              value: formatMemoryUsage(usage.memory_mb_avg, usage.memory_mb_peak, usage.memory_rss_peak_kb),
            },
            {
              label: "GPU util",
              value: formatAvgPeak(usage.gpu_util_pct_avg, usage.gpu_util_pct_peak, formatPct),
            },
            {
              label: "GPU memory",
              value: formatAvgPeak(usage.gpu_memory_mb_avg, usage.gpu_memory_mb_peak, (v) => `${v.toFixed(0)} MB`),
            },
          ]}
        />
      </UsageGroup>
      <UsageGroup title="Disk I/O">
        <MetadataGrid
          columns={2}
          items={[
            { label: "Read", value: formatBytes(usage.disk_read_bytes) },
            { label: "Write", value: formatBytes(usage.disk_write_bytes) },
          ]}
        />
      </UsageGroup>
    </div>
  )
}
