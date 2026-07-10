import Link from "next/link"
import { GitBranch, Loader2 } from "lucide-react"

import { MlopsEmptyState } from "@/components/mlops/layout"
import { StatusBadge } from "@/components/mlops/status-badge"
import type { PipelineItem } from "@/lib/api"
import { formatRelativeTime } from "@/lib/utils"

type PipelineHealthWidgetProps = {
  pipelines: PipelineItem[]
  runningPipelines: PipelineItem[]
}

export function PipelineHealthWidget({ pipelines, runningPipelines }: PipelineHealthWidgetProps) {
  const idleCount = pipelines.length - runningPipelines.length
  const healthPct =
    pipelines.length === 0
      ? 100
      : Math.round(((pipelines.length - runningPipelines.length) / pipelines.length) * 100)

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="text-xl font-bold tabular-nums">{pipelines.length}</div>
        </div>
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-primary">Running</div>
          <div className="text-xl font-bold tabular-nums text-primary">{runningPipelines.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Idle</div>
          <div className="text-xl font-bold tabular-nums">{idleCount}</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Idle ratio</span>
          <span className="tabular-nums">{healthPct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-default"
            style={{ width: `${Math.min(100, (runningPipelines.length / Math.max(1, pipelines.length)) * 100)}%` }}
          />
        </div>
      </div>

      {runningPipelines.length === 0 ? (
        <MlopsEmptyState
          icon={GitBranch}
          title="No running pipelines"
          description="Active pipelines will appear here."
          className="border-0 bg-transparent p-0"
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto">
          {runningPipelines.slice(0, 6).map((pipeline) => (
            <li key={pipeline.pipeline_id}>
              <Link
                href={`/pipelines/${encodeURIComponent(pipeline.pipeline_id)}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 transition-default hover:border-primary/30 hover:bg-primary/5"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-foreground group-hover:text-primary">
                    {pipeline.pipeline_id}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {pipeline.total_runs} runs · {formatRelativeTime(pipeline.updated_at)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge value={pipeline.latest_status} size="sm" />
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
