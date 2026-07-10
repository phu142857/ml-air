import Link from "next/link"
import { Loader2, Play } from "lucide-react"

import { MlopsEmptyState } from "@/components/mlops/layout"
import { StatusBadge } from "@/components/mlops/status-badge"
import type { RunItem } from "@/lib/api"
import { normalizeStatus } from "@/lib/status-style"
import { formatRelativeTime } from "@/lib/utils"

type ActiveRunsWidgetProps = {
  runs: RunItem[]
}

export function ActiveRunsWidget({ runs }: ActiveRunsWidgetProps) {
  const active = runs
    .filter((run) => normalizeStatus(run.status) === "RUNNING")
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime()
      const tb = new Date(b.updated_at || b.created_at || 0).getTime()
      return tb - ta
    })
    .slice(0, 8)

  if (active.length === 0) {
    return (
      <MlopsEmptyState
        icon={Loader2}
        title="No active runs"
        description="Executing runs will appear here in real time."
        className="border-0 bg-transparent p-0"
      />
    )
  }

  return (
    <ul className="space-y-1.5">
      {active.map((run) => (
        <li key={run.run_id}>
          <Link
            href={`/runs/${encodeURIComponent(run.run_id)}`}
            className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 transition-default hover:border-primary/30 hover:bg-primary/5"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground group-hover:text-primary">
                {run.pipeline_id}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {run.run_id}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {formatRelativeTime(run.updated_at || run.created_at)}
              </span>
              <StatusBadge value={run.status} size="sm" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function RecentRunsCompact({ runs }: ActiveRunsWidgetProps) {
  const recent = [...runs]
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime()
      const tb = new Date(b.updated_at || b.created_at || 0).getTime()
      return tb - ta
    })
    .slice(0, 5)

  if (recent.length === 0) {
    return (
      <MlopsEmptyState
        icon={Play}
        title="No runs yet"
        description="Pipeline runs in this scope will appear here."
        className="border-0 bg-transparent p-0"
      />
    )
  }

  return (
    <div className="space-y-1.5">
      {recent.map((run) => (
        <Link
          key={run.run_id}
          href={`/runs/${encodeURIComponent(run.run_id)}`}
          className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 transition-default hover:border-border hover:bg-card"
        >
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-foreground">{run.pipeline_id}</div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">{run.run_id}</div>
          </div>
          <StatusBadge value={run.status} size="sm" />
        </Link>
      ))}
    </div>
  )
}
