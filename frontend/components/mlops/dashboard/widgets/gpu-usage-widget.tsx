"use client"

import { useQuery } from "@tanstack/react-query"
import { Activity, Cpu } from "lucide-react"

import { WidgetSkeleton } from "@/components/mlops/interaction"
import { MlopsEmptyState } from "@/components/mlops/layout"
import { fetchProjectUsage, fetchTenantUsage } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useRealtimeQueryPolling } from "@/lib/realtime-query-polling"
import {
  formatAvgPeak,
  formatPct,
  formatRuntimeSeconds,
} from "@/lib/usage-format"
import { formatApiClientError } from "@/lib/utils"

type GpuUsageWidgetProps = {
  tenantId: string
  projectId: string
  token: string
  showProjectUsage: boolean
  showTenantUsage: boolean
}

export function GpuUsageWidget({
  tenantId,
  projectId,
  token,
  showProjectUsage,
  showTenantUsage,
}: GpuUsageWidgetProps) {
  const poll = useRealtimeQueryPolling()
  const projectQuery = useQuery({
    queryKey: mlairKeys.usage.project(tenantId, projectId ?? "", 30),
    queryFn: () => fetchProjectUsage(tenantId, projectId!, token, { days: 30 }),
    enabled: showProjectUsage && Boolean(tenantId && projectId && token),
    ...poll,
  })

  const tenantQuery = useQuery({
    queryKey: mlairKeys.usage.tenant(tenantId, 30),
    queryFn: () => fetchTenantUsage(tenantId, token, { days: 30 }),
    enabled: showTenantUsage && Boolean(tenantId && token),
    ...poll,
  })

  const query = showProjectUsage ? projectQuery : tenantQuery

  if (!showProjectUsage && !showTenantUsage) {
    return (
      <MlopsEmptyState
        icon={Cpu}
        title="Pin scope for GPU"
        className="border-0 bg-transparent p-0"
      />
    )
  }

  if (query.isLoading) {
    return <WidgetSkeleton lines={3} />
  }

  if (query.isError) {
    return (
      <p className="text-sm text-[color:var(--status-failed-fg)]">
        {formatApiClientError(query.error)}
      </p>
    )
  }

  const enabled = query.data?.enabled ?? true
  const usage = query.data?.usage
  const runCount = query.data?.run_count ?? 0

  if (!enabled) {
    return (
      <MlopsEmptyState
        icon={Activity}
        title="Usage tracking disabled"
        className="border-0 bg-transparent p-0"
      />
    )
  }

  if (!usage || runCount === 0) {
    return (
      <MlopsEmptyState
        icon={Cpu}
        title="No GPU usage"
        className="border-0 bg-transparent p-0"
      />
    )
  }

  const gpuSeconds = usage.gpu_seconds ?? 0
  const gpuPct = usage.gpu_util_pct_peak ?? usage.gpu_util_pct_avg

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">GPU time (30d)</div>
          <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formatRuntimeSeconds(gpuSeconds)}
          </div>
        </div>
        <Cpu className="h-8 w-8 text-primary/70" strokeWidth={1.5} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] text-muted-foreground">Utilization</div>
          <div className="text-sm font-semibold tabular-nums">
            {formatAvgPeak(usage.gpu_util_pct_avg, usage.gpu_util_pct_peak, formatPct)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] text-muted-foreground">Runs</div>
          <div className="text-sm font-semibold tabular-nums">{runCount}</div>
        </div>
      </div>

      {gpuPct != null ? (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Peak GPU load</span>
            <span className="tabular-nums">{formatPct(gpuPct)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-default"
              style={{ width: `${Math.min(100, Number(gpuPct))}%` }}
            />
          </div>
        </div>
      ) : null}

      {showProjectUsage && projectQuery.data?.runs?.length ? (
        <div className="min-h-0 flex-1 overflow-auto border-t border-border/60 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Top GPU runs
          </p>
          <ul className="space-y-1">
            {projectQuery.data.runs.slice(0, 4).map((run) => (
              <li
                key={run.run_id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
              >
                <span className="min-w-0 truncate font-mono text-[10px]">{run.run_id}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {formatRuntimeSeconds(run.gpu_seconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
